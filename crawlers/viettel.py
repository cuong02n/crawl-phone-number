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

# Viettel rate-limits by session: ~20 req/30s sliding window
# Go slower than the limit to avoid triggering it
_RATE_DELAY = 3.0


class ViettelCrawler(BaseCrawler):
    THRESHOLD = 30
    API_URL = "https://vietteltelecom.vn/api/get/sim"

    def __init__(self, job_id, store):
        super().__init__(job_id, store)
        self._session = requests.Session()
        self._session.headers.update(_HEADERS)

        # Rate limiter: enforces _RATE_DELAY between requests across all threads
        self._rate_lock = threading.Lock()
        self._last_req_time = 0.0

        meta = store.get_meta(job_id)

        # Sticky proxy session: D1N cookie is IP-bound, so all requests must use
        # the same proxy IP. Reuse session ID from auto-auth if available.
        self._proxy_session_id = meta.get("proxy_session_id") or uuid.uuid4().hex[:8]
        if meta.get("x_csrf_token"):
            self._session.headers["x-csrf-token"] = meta["x_csrf_token"]
        if meta.get("cookie"):
            for part in meta["cookie"].split(";"):
                part = part.strip()
                if "=" in part:
                    k, v = part.split("=", 1)
                    self._session.cookies.set(k.strip(), v.strip())

    def _throttled_post(self, pattern: str, proxies: dict) -> requests.Response:
        with self._rate_lock:
            wait = _RATE_DELAY - (time.time() - self._last_req_time)
            if wait > 0:
                time.sleep(wait)
            resp = self._session.post(
                self.API_URL,
                json={
                    "key_search": pattern,
                    "page": 1,
                    "page_size": 50,
                    "total_record": 1,
                    "isdn_type": 2,
                    "captcha": "",
                    "sid": "",
                    "page_type": "",
                },
                proxies=proxies,
                timeout=15,
            )
            self._last_req_time = time.time()
        return resp

    def _refresh_d1n(self, resp: requests.Response) -> bool:
        """Extract new D1N from JS challenge and update session. Returns True if refreshed."""
        m = re.search(r'D1N=([a-f0-9]+)', resp.text)
        if not m:
            return False
        self._session.cookies.set('D1N', m.group(1))
        self.logger.info(f"[D1N] auto-refreshed: {m.group(1)[:16]}...")
        return True

    def _refresh_session(self):
        """
        Get a brand-new laravel_session + x_csrf_token via Playwright headless browser.
        Reuses the same sticky proxy IP so D1N cookie is still valid on that IP.
        Persists new credentials to DB so they survive pause/resume.
        """
        from core.viettel_auth import fetch_viettel_credentials
        self.logger.info("[SESSION] refreshing via Playwright (same proxy IP)...")
        creds = fetch_viettel_credentials(proxy_session_id=self._proxy_session_id)

        self._session.headers["x-csrf-token"] = creds["x_csrf_token"]
        for part in creds["cookie"].split(";"):
            part = part.strip()
            if "=" in part:
                k, v = part.split("=", 1)
                self._session.cookies.set(k.strip(), v.strip())

        # Persist to DB so credentials survive pause/resume
        meta = self.store.get_meta(self.job_id)
        meta["x_csrf_token"] = creds["x_csrf_token"]
        meta["cookie"] = creds["cookie"]
        self.store.set_meta(self.job_id, meta)

        self.logger.info(f"[SESSION] refreshed: csrf={creds['x_csrf_token'][:12]}...")

    def fetch(self, pattern: str) -> list[str]:
        proxies = build_proxies(load_config(), session_id=self._proxy_session_id)
        resp = self._throttled_post(pattern, proxies)

        # D1N challenge: HTML response with new D1N embedded in JS
        if 'text/html' in resp.headers.get('content-type', ''):
            if not self._refresh_d1n(resp):
                raise SessionExpiredError("D1N challenge: could not extract new token")
            resp = self._throttled_post(pattern, proxies)
            if 'text/html' in resp.headers.get('content-type', ''):
                raise SessionExpiredError("D1N refresh failed — still getting HTML challenge")

        # 419 = CSRF token mismatch → laravel_session expired
        if resp.status_code == 419:
            raise SessionExpiredError("HTTP 419 — laravel_session/x-csrf-token het han")

        resp.raise_for_status()

        if not resp.text.strip():
            raise ValueError("Empty response body")

        try:
            data = resp.json()
        except Exception:
            raise ValueError(f"Non-JSON (status={resp.status_code}): {resp.text[:300]}")

        error_code = data.get("errorCode")

        # errorCode=1: rate limited.
        # Strategy: get a fresh laravel_session via Playwright (same IP → D1N stays valid).
        # New session = fresh rate-limit budget. Faster than sleeping 60s.
        # If Playwright fails for any reason, fall back to 60s sleep.
        if error_code == 1:
            self.logger.warning(f"[RATE] ec=1 pattern={pattern}, attempting session refresh...")
            try:
                self._refresh_session()
                self.logger.info("[RATE] session refreshed, retrying pattern")
            except Exception as refresh_err:
                self.logger.warning(
                    f"[RATE] session refresh failed ({refresh_err}), falling back to 60s sleep"
                )
                time.sleep(60)

            resp2 = self._throttled_post(pattern, proxies)
            try:
                data = resp2.json()
                error_code = data.get("errorCode")
            except Exception:
                raise ValueError(f"Retry non-JSON: {resp2.text[:300]}")

        if error_code == 1:
            # Still rate-limited after refresh + retry → rate limit is likely per-IP.
            # Log clearly so user can investigate; treat as transient failure.
            self.logger.warning("[RATE] still ec=1 after session refresh — rate limit may be per-IP")
            raise ValueError("API errorCode=1 — rate limited after session refresh")

        if error_code != 0:
            self.logger.warning(
                f"[VIETTEL] errorCode={error_code} msg={data.get('message', '')} "
                f"status={resp.status_code}"
            )
            raise ValueError(f"API errorCode={error_code} msg={data.get('message', '')}")

        return [
            "0" + str(item["isdn"]) if len(str(item["isdn"])) == 9 else str(item["isdn"])
            for item in (data.get("data") or [])
            if item.get("isdn")
        ]
