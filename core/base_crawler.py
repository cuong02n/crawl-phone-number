import logging
import threading
from abc import ABC, abstractmethod

from .job_store import JobStatus, JobStore


class BaseCrawler(ABC):
    THRESHOLD = 30

    def __init__(self, job_id: str, store: JobStore):
        self.job_id = job_id
        self.store = store
        self._stop_event = threading.Event()

        # Per-job file logger
        log_file = store.get_log_file(job_id)
        self.logger = logging.getLogger(f"crawler.{job_id}")
        if not self.logger.handlers:
            handler = logging.FileHandler(log_file, encoding="utf-8")
            handler.setFormatter(
                logging.Formatter("%(asctime)s %(levelname)s %(message)s")
            )
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.INFO)

    # ── Public API ─────────────────────────────────────────────────────────────

    def run(self):
        """Start or resume crawling. Reads pending patterns from DB queue."""
        self._stop_event.clear()
        self.store.set_status(self.job_id, JobStatus.RUNNING)
        self.logger.info(f"=== Job {self.job_id} RUNNING ===")

        while not self._stop_event.is_set():
            pattern = self.store.pop_next(self.job_id)
            if pattern is None:
                self.store.set_status(self.job_id, JobStatus.COMPLETED)
                self.logger.info(f"=== Job {self.job_id} COMPLETED ===")
                return

            self._process(pattern)

        # Reached here because stop_event was set (pause)
        self.store.set_status(self.job_id, JobStatus.PAUSED)
        self.logger.info(f"=== Job {self.job_id} PAUSED ===")

    def pause(self):
        """Signal the crawler to stop after the current pattern finishes."""
        self._stop_event.set()

    # ── Subclass interface ─────────────────────────────────────────────────────

    @abstractmethod
    def fetch(self, pattern: str) -> list[str]:
        """Call the carrier API for `pattern`. Return list of phone numbers.
        Raise any exception on unrecoverable error."""
        ...

    # ── Internal ───────────────────────────────────────────────────────────────

    def _process(self, pattern: str):
        try:
            numbers = self.fetch(pattern)
        except Exception as e:
            self.logger.error(f"fetch failed pattern={pattern}: {e}")
            self.store.mark_failed(self.job_id, pattern)
            return

        if len(numbers) < self.THRESHOLD:
            self._save(numbers)
            self.store.mark_done(self.job_id, pattern)
            self.logger.info(f"leaf pattern={pattern} saved={len(numbers)}")
        elif "?" in pattern:
            idx = pattern.index("?")
            children = [pattern[:idx] + d + pattern[idx + 1:] for d in "0123456789"]
            self.store.enqueue(self.job_id, children)
            self.store.mark_done(self.job_id, pattern)
            self.logger.info(f"expand pattern={pattern} → {len(children)} children")
        else:
            # No wildcards left but still ≥ threshold — save anyway
            self._save(numbers)
            self.store.mark_done(self.job_id, pattern)

    def _save(self, numbers: list[str]):
        if not numbers:
            return
        output_file = self.store.get_output_file(self.job_id)
        with open(output_file, "a", encoding="utf-8") as f:
            for n in sorted(numbers):
                f.write(n + "\n")
        self.store.increment_saved(self.job_id, len(numbers))
