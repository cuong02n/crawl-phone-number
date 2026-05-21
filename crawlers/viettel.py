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
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}

# errorCodes Viettel trả về khi session/cookie hết hạn
# Thêm vào đây sau khi quan sát log
_SESSION_EXPIRED_CODES = {401, 403}


class ViettelCrawler(BaseCrawler):
    THRESHOLD = 30
    API_URL = "https://vietteltelecom.vn/api/get/sim"

    def __init__(self, job_id, store):
        super().__init__(job_id, store)
        self._session = requests.Session()
        self._session.headers.update(_HEADERS)

        meta = store.get_meta(job_id)
        if meta.get("x_csrf_token"):
            self._session.headers["x-csrf-token"] = meta["x_csrf_token"]
        if meta.get("cookie"):
            # parse cookie string into session cookiejar
            for part in meta["cookie"].split(";"):
                part = part.strip()
                if "=" in part:
                    k, v = part.split("=", 1)
                    self._session.cookies.set(k.strip(), v.strip())

    def fetch(self, pattern: str) -> list[str]:
        config = load_config()
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
            proxies=build_proxies(config),
            timeout=10,
        )

        # HTTP-level auth failure → session definitely dead
        if resp.status_code in (401, 403):
            raise SessionExpiredError(
                f"HTTP {resp.status_code} — laravel_session/D1N hết hạn. Body: {resp.text[:300]}"
            )

        resp.raise_for_status()

        if not resp.text.strip():
            raise ValueError("Empty response body")

        try:
            data = resp.json()
        except Exception:
            raise ValueError(f"Non-JSON response (status={resp.status_code}): {resp.text[:300]}")

        error_code = data.get("errorCode")
        if error_code != 0:
            self.logger.warning(
                f"[VIETTEL] errorCode={error_code} msg={data.get('message', '')} "
                f"pattern={pattern} status={resp.status_code} "
                f"body={resp.text[:300]}"
            )
            if error_code in _SESSION_EXPIRED_CODES:
                raise SessionExpiredError(
                    f"errorCode={error_code} msg={data.get('message', '')} — session hết hạn"
                )
            raise ValueError(f"API errorCode={error_code} msg={data.get('message', '')}")

        return [
            "0" + str(item["isdn"]) if len(str(item["isdn"])) == 9 else str(item["isdn"])
            for item in data.get("data", [])
            if item.get("isdn")
        ]