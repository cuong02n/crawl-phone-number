import re
import threading
import time
import uuid
import requests

from core.base_crawler import BaseCrawler, SessionExpiredError
from core.config import build_proxies, load_config

_HEADERS = {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json;charset=UTF-8",
    "origin": "https://vietteltelecom.vn",
    "referer": "https://vietteltelecom.vn/di-dong/sim-so",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0"
    ),
    "x-requested-with": "XMLHttpRequest",
}

# Per-thread rate limit: each thread has its own proxy IP → own budget.
# Empirical: 2s delay keeps `ec=1` rate ~1.5% of requests with multi-thread crawl.
# Reduce further only if you see ec=1 rate stay low after the change.
_RATE_DELAY = 2.0

# Valid Vietnamese mobile prefixes to seed when the user picks the "all 0?…" root.
# Skips 00/01/02/04-07 (landline / unused). Viettel covers 03x, 086, 089, 096-098.
_VIETTEL_ROOT_SEEDS = ["03????????", "08????????", "09????????"]


class ViettelCrawler(BaseCrawler):
    THRESHOLD = 30
    API_URL   = "https://vietteltelecom.vn/api/get/sim"

    def __init__(self, job_id, store):
        super().__init__(job_id, store)
        meta = store.get_meta(job_id)

        # Template credentials — used to bootstrap new thread sessions.
        # Updated in-place whenever a Playwright refresh produces new credentials.
        self._creds_lock = threading.Lock()
        self._creds = {
            "x_csrf_token": meta.get("x_csrf_token", ""),
            "cookie":        meta.get("cookie", ""),
        }

        # If True, requests go directly from the host IP instead of through a proxy.
        self._no_proxy = bool(meta.get("no_proxy", False))

        # 2 = trả trước (prepaid), 22 = trả sau (postpaid). Persisted for pause/resume.
        self._isdn_type = int(meta.get("isdn_type", 2))

        # Only one thread may launch Playwright at a time for laravel refresh.
        self._laravel_lock = threading.Lock()

        # Live stats — reset each crawler instance (pause/resume creates a fresh one).
        self._stats_lock            = threading.Lock()
        self._request_count         = 0
        self._session_refresh_count = 0
        self._d1n_refresh_count     = 0
        self._ip_rotate_count       = 0
        self._ec1_count             = 0  # how many times Viettel said "ec=1" (rate limit)

    def _bump(self, attr: str):
        with self._stats_lock:
            setattr(self, attr, getattr(self, attr) + 1)

    def get_stats(self) -> dict:
        with self._stats_lock:
            return {
                "requests":          self._request_count,
                "session_refreshes": self._session_refresh_count,
                "d1n_refreshes":     self._d1n_refresh_count,
                "ip_rotates":        self._ip_rotate_count,
                "ec1":               self._ec1_count,
            }

    # ── Smart seeding ─────────────────────────────────────────────────────────

    def run(self, threads: int = 1):
        """Swap the all-mobile root seed for valid Viettel prefix roots, then run."""
        # Only swap on a fresh job (queue still has just the original seed pattern).
        # Pause/resume mid-crawl leaves queue_count > 1, so this is a no-op then.
        if self.store.queue_count(self.job_id) == 1:
            job = self.store.get_job(self.job_id)
            if job and job.get("pattern") == "0?????????":
                self.store.clear_queue(self.job_id)
                self.store.enqueue(self.job_id, _VIETTEL_ROOT_SEEDS)
                self.logger.info(
                    f"Smart seed: skipping 00/01/02/04-07 → enqueue {_VIETTEL_ROOT_SEEDS}"
                )
        super().run(threads)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _t(self, attr, default=None):
        return getattr(self._tl, attr, default)

    def _tnum(self):
        return self._t("num", "?")

    # ── Per-thread session ─────────────────────────────────────────────────────

    def _build_session(self) -> requests.Session:
        """Create a fresh requests.Session from the current credential template."""
        sess = requests.Session()
        sess.headers.update(_HEADERS)
        with self._creds_lock:
            csrf   = self._creds["x_csrf_token"]
            cookie = self._creds["cookie"]
        if csrf:
            sess.headers["x-csrf-token"] = csrf
        for part in cookie.split(";"):
            k, _, v = part.strip().partition("=")
            if k and v:
                sess.cookies.set(k.strip(), v.strip())
        return sess

    def _ensure_session(self):
        """Initialize thread-local session on first use."""
        if not hasattr(self._tl, "session"):
            self._tl.session   = self._build_session()
            self._tl.proxy_sid = uuid.uuid4().hex[:8]
            self._tl.last_req  = 0.0
            if self._no_proxy:
                self.logger.info(f"[T{self._tnum()}] session init, no_proxy mode (direct IP)")
            else:
                self.logger.info(
                    f"[T{self._tnum()}] session init, proxy_sid={self._tl.proxy_sid}"
                )

    def _rotate_ip(self):
        """
        Switch this thread to a fresh proxy IP (new proxy_session_id).
        laravel_session + csrf stay the same — only the IP changes.
        The old D1N is invalid for the new IP; the next request will trigger a
        D1N challenge that _post_resolved() handles automatically.

        In no_proxy mode we can't rotate — just reset rate-limit timing so the
        retry isn't blocked, and log the skip.
        """
        if self._no_proxy:
            self._tl.last_req = 0.0
            self.logger.info(f"[T{self._tnum()}] rotate skipped (no_proxy mode)")
            return
        old = self._t("proxy_sid", "none")
        self._tl.proxy_sid = uuid.uuid4().hex[:8]
        self._tl.last_req  = 0.0
        self._bump("_ip_rotate_count")
        self.logger.info(f"[T{self._tnum()}] rotate IP {old} → {self._tl.proxy_sid}")

    def _apply_creds_to_session(self):
        """Push current credential template into this thread's session."""
        with self._creds_lock:
            csrf   = self._creds["x_csrf_token"]
            cookie = self._creds["cookie"]
        self._tl.session.headers["x-csrf-token"] = csrf
        for part in cookie.split(";"):
            k, _, v = part.strip().partition("=")
            if k and v:
                self._tl.session.cookies.set(k.strip(), v.strip())

    # ── Low-level POST ────────────────────────────────────────────────────────

    def _post(self, pattern: str) -> requests.Response:
        """Single POST with per-thread rate limiting."""
        self._ensure_session()
        if self._no_proxy:
            proxies = None
        else:
            config  = load_config()
            proxies = build_proxies(config, session_id=self._tl.proxy_sid)

        wait = _RATE_DELAY - (time.time() - self._tl.last_req)
        if wait > 0:
            time.sleep(wait)

        resp = self._tl.session.post(
            self.API_URL,
            json={
                "key_search": pattern, "page": 1, "page_size": 50,
                "total_record": 1, "isdn_type": self._isdn_type,
                "captcha": "", "sid": "", "page_type": "",
            },
            proxies=proxies,
            timeout=15,
        )
        self._tl.last_req = time.time()
        self._bump("_request_count")
        return resp

    # ── D1N challenge ─────────────────────────────────────────────────────────

    def _refresh_d1n(self, body: str) -> bool:
        """Extract D1N from HTML challenge body and store in thread session."""
        m = re.search(r"D1N=([a-f0-9]+)", body)
        if not m:
            return False
        self._tl.session.cookies.set("D1N", m.group(1))
        self._bump("_d1n_refresh_count")
        self.logger.info(f"[T{self._tnum()}] D1N refreshed {m.group(1)[:16]}…")
        return True

    # Network errors worth retrying with a fresh IP (transient / proxy-side).
    _NET_RETRY_EXC = (
        requests.exceptions.SSLError,
        requests.exceptions.ConnectionError,
        requests.exceptions.Timeout,
        requests.exceptions.ChunkedEncodingError,
    )
    _MAX_NET_RETRIES = 3

    def _post_with_net_retry(self, pattern: str) -> requests.Response:
        """POST with retry on transient network/proxy errors via IP rotation."""
        last_exc = None
        for attempt in range(self._MAX_NET_RETRIES):
            try:
                return self._post(pattern)
            except self._NET_RETRY_EXC as e:
                last_exc = e
                exc_name = type(e).__name__
                self.logger.warning(
                    f"[T{self._tnum()}] {exc_name} attempt={attempt + 1}/{self._MAX_NET_RETRIES} "
                    f"pattern={pattern}: {str(e)[:120]}"
                )
                if attempt < self._MAX_NET_RETRIES - 1:
                    self._rotate_ip()
                    time.sleep(1.0 + attempt)  # small back-off
        raise last_exc

    def _post_resolved(
        self, pattern: str, *, _rotated: bool = False, _laravel_refreshed: bool = False,
    ) -> requests.Response:
        """
        POST with escalating recovery cascade.

        Each recovery step is tried at most once per fetch:
          1. POST (with network-retry) → if JSON, return.
          2. HTML challenge → extract D1N → retry.
          3. Still HTML → rotate IP → recurse.
          4. Still HTML after rotate → refresh laravel_session via Playwright → recurse.
          5. Still HTML after both → raise SessionExpiredError.
        """
        resp = self._post_with_net_retry(pattern)
        if "text/html" not in resp.headers.get("content-type", ""):
            return resp

        # Step 2: extract D1N from HTML and retry
        if self._refresh_d1n(resp.text):
            resp = self._post_with_net_retry(pattern)
            if "text/html" not in resp.headers.get("content-type", ""):
                return resp

        # Step 3: rotate IP if we haven't yet
        if not _rotated:
            self.logger.warning(f"[T{self._tnum()}] D1N unresolved, rotating IP")
            self._rotate_ip()
            return self._post_resolved(
                pattern, _rotated=True, _laravel_refreshed=_laravel_refreshed
            )

        # Step 4: refresh laravel_session if we haven't yet
        if not _laravel_refreshed:
            self.logger.warning(
                f"[T{self._tnum()}] D1N still unresolved after IP rotate — "
                f"refreshing laravel_session via Playwright"
            )
            self._refresh_laravel()
            # Reset _rotated so we can pair the fresh creds with a fresh IP too if needed.
            return self._post_resolved(
                pattern, _rotated=False, _laravel_refreshed=True
            )

        # Step 5: exhausted all recovery paths
        raise SessionExpiredError(
            "D1N challenge unresolved after IP rotation + laravel_session refresh"
        )

    # ── laravel_session refresh via Playwright ────────────────────────────────

    def _refresh_laravel(self):
        """
        Playwright launch to get a fresh laravel_session.
        Uses a lock so only one thread launches at a time; others wait and
        then adopt the new credentials from the template without launching again.
        """
        t = self._tnum()

        # Snapshot current laravel value before acquiring lock
        current_laravel = self._tl.session.cookies.get("laravel_session", "")

        with self._laravel_lock:
            # If another thread already refreshed while we waited, just adopt
            with self._creds_lock:
                template_laravel = ""
                for part in self._creds["cookie"].split(";"):
                    k, _, v = part.strip().partition("=")
                    if k.strip() == "laravel_session":
                        template_laravel = v.strip()
                        break

            if template_laravel and template_laravel != current_laravel:
                self.logger.info(f"[T{t}] laravel already refreshed by peer, adopting")
                self._apply_creds_to_session()
                return

            # We are the one refreshing
            self.logger.info(f"[T{t}] launching Playwright for laravel_session…")
            self._bump("_session_refresh_count")
            from core.viettel_auth import fetch_viettel_credentials
            creds = fetch_viettel_credentials(
                proxy_session_id=self._t("proxy_sid"),
                no_proxy=self._no_proxy,
            )

            # Update shared template
            with self._creds_lock:
                self._creds["x_csrf_token"] = creds["x_csrf_token"]
                self._creds["cookie"]        = creds["cookie"]

            # Update this thread's session
            self._apply_creds_to_session()

            # Persist to DB so pause/resume picks up new credentials
            meta = self.store.get_meta(self.job_id)
            meta["x_csrf_token"] = creds["x_csrf_token"]
            meta["cookie"]       = creds["cookie"]
            self.store.set_meta(self.job_id, meta)
            self.logger.info(f"[T{t}] laravel_session refreshed ok")

    # ── Main fetch ────────────────────────────────────────────────────────────

    def fetch(self, pattern: str) -> list[str]:
        t = self._tnum()

        # ── Step 1: GET response, resolving D1N challenges automatically ──────
        resp = self._post_resolved(pattern)

        # ── Step 2: 419 = laravel_session / CSRF expired ──────────────────────
        if resp.status_code == 419:
            self.logger.warning(f"[T{t}] 419, refreshing laravel_session")
            self._refresh_laravel()
            resp = self._post_resolved(pattern)
            if resp.status_code == 419:
                raise SessionExpiredError("419 persists after laravel refresh")

        resp.raise_for_status()

        if not resp.text.strip():
            raise ValueError("Empty response")

        try:
            data = resp.json()
        except Exception:
            raise ValueError(f"Non-JSON ({resp.status_code}): {resp.text[:300]}")

        ec = data.get("errorCode")

        # ── Step 3: ec=1 = rate limited → rotate to fresh IP ─────────────────
        if ec == 1:
            self._bump("_ec1_count")
            self.logger.warning(f"[T{t}] ec=1 rate limited, rotating IP")
            self._rotate_ip()
            resp = self._post_resolved(pattern)
            if resp.status_code == 419:
                self._refresh_laravel()
                resp = self._post_resolved(pattern)
            try:
                data = resp.json()
                ec   = data.get("errorCode")
            except Exception:
                raise ValueError(f"Retry non-JSON: {resp.text[:300]}")

        if ec == 1:
            raise ValueError("ec=1 after IP rotation — server-wide rate limit?")
        if ec != 0:
            raise ValueError(f"errorCode={ec} msg={data.get('message', '')}")

        return self._parse_numbers(data, resp.text)

    # ── Response validation ────────────────────────────────────────────────────

    @staticmethod
    def _wrong_format(raw_text: str) -> ValueError:
        snippet = raw_text if len(raw_text) <= 2000 else raw_text[:2000] + f"… (truncated, total {len(raw_text)} chars)"
        return ValueError(
            f"Cannot parse number, because viettel server response with wrong format: {snippet}"
        )

    def _parse_numbers(self, data: dict, raw_text: str) -> list[str]:
        """
        Validate response against the expected Viettel schema and extract phone numbers.

        Expected (errorCode=0) format:
          { "errorCode": 0, "data": [ {"isdn": "359445550", ...}, ... ], ... }

        Where each item is a dict with an `isdn` field that is a digit string of
        length 9 (mobile without leading 0) or 10 (full mobile). Any deviation
        raises ValueError with the full response so the caller can debug.
        Empty list (`data: []` or `data: null`) is treated as "no results" — not an error.
        """
        # `data` field may be a list OR null (== no results). Anything else is wrong.
        raw_data = data.get("data")
        if raw_data is None:
            return []
        if not isinstance(raw_data, list):
            raise self._wrong_format(raw_text)

        numbers: list[str] = []
        for item in raw_data:
            if not isinstance(item, dict) or "isdn" not in item:
                raise self._wrong_format(raw_text)
            isdn = item.get("isdn")
            if isdn is None or isdn == "":
                # Some items may legitimately omit a value — skip silently.
                continue
            s = str(isdn).strip()
            if not s.isdigit() or len(s) not in (9, 10):
                raise self._wrong_format(raw_text)
            numbers.append("0" + s if len(s) == 9 else s)
        return numbers
