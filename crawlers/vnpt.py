import queue
import requests

from core.base_crawler import BaseCrawler
from core.job_store import JobStatus, JobStore

# VNPT crawls 5 prefixes concurrently.
# Patterns in the queue are encoded as "{prefix}:{search}" e.g. "82:" or "82:123"
# so the base crawler queue machinery works without modification.

PREFIXES = ["82", "85", "88", "91", "94"]
API_URL = "https://digishop.vnpt.vn/apiprod/sim/num_search3"
MAX_SEARCH_DEPTH = 7  # don't expand the search string beyond 7 digits


class VNPTCrawler(BaseCrawler):
    THRESHOLD = 50

    def __init__(self, job_id: str, store: JobStore):
        super().__init__(job_id, store)
        self._session = requests.Session()

    def run(self, threads: int = 1):
        """Override to seed 5 prefix roots then delegate to base worker loop."""
        self._stop_event.clear()
        self._exit_queue = queue.Queue()
        self.store.requeue_processing(self.job_id)  # reclaim orphaned in-flight rows
        with self._threads_lock:
            self._target_threads = threads
            self._next_idx = threads + 1
        self.store.set_status(self.job_id, JobStatus.RUNNING)
        self.logger.info(f"=== Job {self.job_id} RUNNING (VNPT, {threads} thread(s)) ===")

        # On a fresh job the queue has only 1 row (the placeholder seed).
        # Replace it with 5 prefix roots.
        if self.store.queue_count(self.job_id) <= 1:
            self.store.clear_queue(self.job_id)
            self.store.enqueue(self.job_id, [f"{p}:" for p in PREFIXES])
            self.logger.info(f"Seeded {len(PREFIXES)} prefix roots.")

        self._run_workers(threads)

    def _process(self, encoded: str):
        t = getattr(self._tl, 'num', 1)
        prefix, search = encoded.split(":", 1)
        try:
            numbers, total_items = self._query(prefix, search)
        except Exception as e:
            self.logger.error(f"[T{t}] fetch failed prefix={prefix} search={search}: {e}")
            self.store.mark_failed(self.job_id, encoded)
            return

        at_max_depth = len(search) >= MAX_SEARCH_DEPTH

        if total_items < self.THRESHOLD or at_max_depth:
            self._save(numbers)
            self.store.mark_done(self.job_id, encoded)
            self.logger.info(f"[T{t}] leaf prefix={prefix} search={search!r} saved={len(numbers)}")
        else:
            children = [f"{prefix}:{search}{d}" for d in "0123456789"]
            self.store.enqueue(self.job_id, children)
            self.store.mark_done(self.job_id, encoded)
            self.logger.info(f"[T{t}] expand prefix={prefix} search={search!r} totalItems={total_items}")

    def _query(self, prefix: str, search: str) -> tuple[list[str], int]:
        resp = self._session.get(
            API_URL,
            params={"prefix": f"84{prefix}", "search": f"{search}*" if search else "*"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if str(data.get("errorCode")) != "0":
            raise ValueError(f"API error: {data}")
        numbers = [item["so_tb"][2:] for item in data.get("data", [])]
        total = int(data.get("totalItems", 0))
        return numbers, total

    def fetch(self, pattern: str) -> list[str]:
        # Not used — VNPTCrawler overrides run() and _process() directly.
        raise NotImplementedError