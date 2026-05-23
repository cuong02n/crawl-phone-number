"""
Vietnamobile crawler.

API: POST https://shop.vietnamobile.com.vn/index.php?controller=contact&token=<TOKEN>
     body (form-urlencoded): action=searchNum&pattern=<digits>*

Response: {"phones": ["0586874468", "0589347213", ...]}

The API accepts only a "prefix*" search — the prefix is the digits AFTER the
implicit leading "0". So our internal pattern uses VNPT-style "search" tokens
(e.g. "5", "58", "586"), seeded with 0-9 at the root.
"""
import queue
import threading
import time
import uuid

import requests

from core.base_crawler import BaseCrawler
from core.config import build_proxies, load_config
from core.job_store import JobStatus, JobStore

API_URL          = "https://shop.vietnamobile.com.vn/index.php"
MAX_SEARCH_DEPTH = 8        # don't expand beyond 8-digit prefix (number is 10 incl. leading 0)
_RATE_DELAY      = 1.0      # per-thread minimum delay between requests

_HEADERS = {
    "accept":           "application/json, text/javascript, */*; q=0.01",
    "content-type":     "application/x-www-form-urlencoded; charset=UTF-8",
    "origin":           "https://shop.vietnamobile.com.vn",
    "referer":          "https://shop.vietnamobile.com.vn/",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0"
    ),
    "x-requested-with": "XMLHttpRequest",
}


class VietnamobileCrawler(BaseCrawler):
    # API caps response at ~10 items; expand whenever we hit the cap.
    THRESHOLD = 10

    def __init__(self, job_id: str, store: JobStore):
        super().__init__(job_id, store)
        meta = store.get_meta(job_id)
        self._token    = meta.get("token", "")
        self._no_proxy = bool(meta.get("no_proxy", False))

    # ── Per-thread session ────────────────────────────────────────────────────

    def _tnum(self):
        return getattr(self._tl, "num", "?")

    def _ensure_session(self):
        if not hasattr(self._tl, "session"):
            self._tl.session = requests.Session()
            self._tl.session.headers.update(_HEADERS)
            self._tl.proxy_sid = uuid.uuid4().hex[:8]
            self._tl.last_req  = 0.0
            mode = "no_proxy (direct IP)" if self._no_proxy else f"proxy_sid={self._tl.proxy_sid}"
            self.logger.info(f"[T{self._tnum()}] session init, {mode}")

    def _rotate_ip(self):
        if self._no_proxy:
            self._tl.last_req = 0.0
            self.logger.info(f"[T{self._tnum()}] rotate skipped (no_proxy mode)")
            return
        old = getattr(self._tl, "proxy_sid", "none")
        self._tl.proxy_sid = uuid.uuid4().hex[:8]
        self._tl.last_req  = 0.0
        self.logger.info(f"[T{self._tnum()}] rotate IP {old} → {self._tl.proxy_sid}")

    # ── Lifecycle: override run() to seed 10 digit roots ──────────────────────

    def run(self, threads: int = 1):
        self._stop_event.clear()
        self._exit_queue = queue.Queue()
        self.store.requeue_processing(self.job_id)
        with self._threads_lock:
            self._target_threads = threads
            self._next_idx = threads + 1
        self.store.set_status(self.job_id, JobStatus.RUNNING)
        self.logger.info(f"=== Job {self.job_id} RUNNING (Vietnamobile, {threads} thread(s)) ===")

        # Fresh job → seed all single-digit prefixes (0-9 after the implicit "0").
        # Most of them (0, 1, 4, 6 …) will be leaves with 0 results — quick to clear.
        if self.store.queue_count(self.job_id) <= 1:
            self.store.clear_queue(self.job_id)
            roots = [str(d) for d in range(10)]
            self.store.enqueue(self.job_id, roots)
            self.logger.info(f"Seeded {len(roots)} digit roots: {roots}")

        self._run_workers(threads)

    # ── Override _process() — pattern is a raw digit prefix (e.g., "58") ─────

    def _process(self, prefix: str):
        t = getattr(self._tl, 'num', 1)
        try:
            numbers = self._query(prefix)
        except Exception as e:
            self.logger.error(f"[T{t}] fetch failed prefix={prefix!r}: {e}")
            self.store.mark_failed(self.job_id, prefix)
            return

        got = len(numbers)
        at_max_depth = len(prefix) >= MAX_SEARCH_DEPTH

        if got < self.THRESHOLD or at_max_depth:
            self._save(numbers)
            self.store.mark_done(self.job_id, prefix)
            self.logger.info(f"[T{t}] leaf prefix={prefix!r} got={got} saved={got}")
        else:
            children = [f"{prefix}{d}" for d in "0123456789"]
            self.store.enqueue(self.job_id, children)
            self.store.mark_done(self.job_id, prefix)
            self.logger.info(
                f"[T{t}] expand prefix={prefix!r} got={got} ≥ {self.THRESHOLD} "
                f"→ split into {len(children)} children"
            )

    # ── API call ─────────────────────────────────────────────────────────────

    def _query(self, prefix: str) -> list[str]:
        self._ensure_session()
        if self._no_proxy:
            proxies = None
        else:
            proxies = build_proxies(load_config(), session_id=self._tl.proxy_sid)

        wait = _RATE_DELAY - (time.time() - self._tl.last_req)
        if wait > 0:
            time.sleep(wait)

        resp = self._tl.session.post(
            API_URL,
            params={"controller": "contact", "token": self._token},
            data={"action": "searchNum", "pattern": f"{prefix}*"},
            proxies=proxies,
            timeout=15,
        )
        self._tl.last_req = time.time()

        if resp.status_code != 200:
            raise ValueError(f"HTTP {resp.status_code}: {resp.text[:300]}")
        if not resp.text.strip():
            raise ValueError("Empty response")
        try:
            data = resp.json()
        except Exception:
            raise ValueError(f"Non-JSON: {resp.text[:300]}")

        return self._parse_phones(data, resp.text)

    # ── Response validation ───────────────────────────────────────────────────

    @staticmethod
    def _wrong_format(raw_text: str) -> ValueError:
        snippet = raw_text if len(raw_text) <= 2000 else raw_text[:2000] + f"… (truncated, total {len(raw_text)} chars)"
        return ValueError(
            f"Cannot parse number, because vietnamobile server response with wrong format: {snippet}"
        )

    def _parse_phones(self, data: dict, raw_text: str) -> list[str]:
        """Expected format: {"phones": ["0586874468", ...]}."""
        phones = data.get("phones") if isinstance(data, dict) else None
        if phones is None:
            return []
        if not isinstance(phones, list):
            raise self._wrong_format(raw_text)
        result: list[str] = []
        for p in phones:
            s = str(p).strip()
            if not s.isdigit() or len(s) != 10 or not s.startswith("0"):
                raise self._wrong_format(raw_text)
            result.append(s)
        return result

    # ── fetch() unused — _process() is overridden ─────────────────────────────

    def fetch(self, pattern: str) -> list[str]:
        raise NotImplementedError
