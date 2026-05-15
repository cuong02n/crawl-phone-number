import requests

from core.base_crawler import BaseCrawler
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
        resp.raise_for_status()

        if not resp.text.strip():
            raise ValueError("Empty response body")

        try:
            data = resp.json()
        except Exception:
            raise ValueError(f"Non-JSON response (status={resp.status_code}): {resp.text[:200]}")

        if data.get("errorCode") != 0:
            raise ValueError(
                f"API errorCode={data.get('errorCode')} msg={data.get('message', '')}"
            )

        return [
            "0" + str(item["isdn"]) if len(str(item["isdn"])) == 9 else str(item["isdn"])
            for item in data.get("data", [])
            if item.get("isdn")
        ]