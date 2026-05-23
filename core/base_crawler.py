import logging
import queue
import threading
import time
from abc import ABC, abstractmethod

from .job_store import JobStatus, JobStore


class SessionExpiredError(Exception):
    """Raised when the carrier rejects our session/cookie — stop the job immediately."""


class BaseCrawler(ABC):
    THRESHOLD = 30

    def __init__(self, job_id: str, store: JobStore):
        self.job_id = job_id
        self.store = store
        self._stop_event = threading.Event()
        self._file_lock = threading.Lock()

        self._threads_lock = threading.Lock()
        self._active_count = 0
        self._next_idx = 1
        self._target_threads = 1
        self._exit_queue = queue.Queue()  # sentinels tell excess workers to exit
        self._tl = threading.local()      # per-thread: self._tl.num

        log_file = store.get_log_file(job_id)
        self.logger = logging.getLogger(f"crawler.{job_id}")
        for h in self.logger.handlers[:]:
            h.close()
            self.logger.removeHandler(h)
        handler = logging.FileHandler(log_file, encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        self.logger.addHandler(handler)
        self.logger.setLevel(logging.INFO)

    # ── Public API ─────────────────────────────────────────────────────────────

    def run(self, threads: int = 1):
        self._stop_event.clear()
        self._exit_queue = queue.Queue()  # reset on each run
        self.store.requeue_processing(self.job_id)  # reclaim orphaned in-flight rows
        with self._threads_lock:
            self._target_threads = threads
            self._next_idx = threads + 1
        self.store.set_status(self.job_id, JobStatus.RUNNING)
        self.logger.info(f"=== Job {self.job_id} RUNNING ({threads} thread(s)) ===")
        self._run_workers(threads)

    def pause(self):
        self._stop_event.set()

    def set_threads(self, n: int):
        """Adjust thread count at runtime."""
        n = max(1, min(50, n))
        with self._threads_lock:
            old = self._target_threads
            self._target_threads = n
            active = self._active_count
            start_idx = self._next_idx
            if n > active:
                self._next_idx += (n - active)

        if n < old:
            # Signal excess workers to exit gracefully
            for _ in range(old - n):
                self._exit_queue.put(None)
            self.logger.info(f"[CTRL] threads {old} → {n}")
        elif n > active:
            to_spawn = n - active
            for i in range(to_spawn):
                self._spawn_worker(start_idx + i)
            self.logger.info(f"[CTRL] threads {old} → {n} (+{to_spawn} spawned)")

    # ── Subclass interface ─────────────────────────────────────────────────────

    @abstractmethod
    def fetch(self, pattern: str) -> list[str]:
        """Call the carrier API for `pattern`. Raise on error."""
        ...

    # ── Internal ───────────────────────────────────────────────────────────────

    def _run_workers(self, threads: int):
        for i in range(1, threads + 1):
            self._spawn_worker(i)

        # Wait until every worker has exited
        while True:
            with self._threads_lock:
                if self._active_count == 0:
                    break
            time.sleep(0.3)

        if self._stop_event.is_set():
            # _pause() already wrote PAUSED to DB before setting stop_event.
            # Don't overwrite — a resume() may have already set status back to RUNNING.
            self.logger.info(f"=== Job {self.job_id} PAUSED ===")
        else:
            job = self.store.get_job(self.job_id)
            if job and job["status"] == JobStatus.PAUSED:
                self.logger.info(f"=== Job {self.job_id} PAUSED (DB signal) ===")
            else:
                self.store.set_status(self.job_id, JobStatus.COMPLETED)
                self.logger.info(f"=== Job {self.job_id} COMPLETED ===")

    def _spawn_worker(self, idx: int):
        with self._threads_lock:
            self._active_count += 1

        def _run():
            try:
                self._worker_loop(idx)
            finally:
                with self._threads_lock:
                    self._active_count -= 1

        threading.Thread(target=_run, daemon=True).start()

    def _worker_loop(self, thread_num: int):
        self._tl.num = thread_num
        spin_cycles = 0
        while not self._stop_event.is_set():
            # Scale-down: consume a sentinel and exit
            try:
                self._exit_queue.get_nowait()
                self.logger.info(f"[T{thread_num}] scaling down, exiting")
                return
            except queue.Empty:
                pass

            job = self.store.get_job(self.job_id)
            if job and job["status"] == JobStatus.PAUSED:
                return

            pattern = self.store.pop_next(self.job_id)
            if pattern is None:
                progress = self.store.get_progress(self.job_id)
                if progress["pending"] == 0:
                    return  # queue truly empty

                spin_cycles += 1
                # If this is the last active worker and still no pending rows after
                # 2s of spinning, all remaining rows are stuck in 'processing' from
                # a previous crash. Safe to requeue since no other worker holds them.
                if spin_cycles >= 10:
                    with self._threads_lock:
                        is_last = self._active_count == 1
                    if is_last:
                        self.store.requeue_processing(self.job_id)
                        self.logger.info(f"[T{thread_num}] requeued stuck processing rows")
                    spin_cycles = 0
                time.sleep(0.2)
                continue

            spin_cycles = 0
            self._process(pattern)

    def _process(self, pattern: str):
        t = getattr(self._tl, 'num', 1)
        try:
            numbers = self.fetch(pattern)
        except SessionExpiredError as e:
            self.logger.error(f"[T{t}] SESSION EXPIRED — dừng job: {e}")
            self.store.set_status(self.job_id, JobStatus.FAILED, reason=str(e))
            self._stop_event.set()
            return
        except Exception as e:
            self.logger.error(f"[T{t}] fetch failed pattern={pattern}: {e}")
            self.store.mark_failed(self.job_id, pattern)
            return

        if len(numbers) < self.THRESHOLD:
            self._save(numbers)
            self.store.mark_done(self.job_id, pattern)
            self.logger.info(f"[T{t}] leaf pattern={pattern} got={len(numbers)} saved={len(numbers)}")
        elif "?" in pattern:
            idx = pattern.index("?")
            children = [pattern[:idx] + d + pattern[idx + 1:] for d in "0123456789"]
            self.store.enqueue(self.job_id, children)
            self.store.mark_done(self.job_id, pattern)
            self.logger.info(
                f"[T{t}] expand pattern={pattern} got={len(numbers)} ≥ {self.THRESHOLD} "
                f"→ split into {len(children)} children"
            )
        else:
            self._save(numbers)
            self.store.mark_done(self.job_id, pattern)

    def _save(self, numbers: list[str]):
        if not numbers:
            return
        output_file = self.store.get_output_file(self.job_id)
        with self._file_lock:
            with open(output_file, "a", encoding="utf-8") as f:
                for n in sorted(numbers):
                    f.write(n + "\n")
        self.store.increment_saved(self.job_id, len(numbers))
