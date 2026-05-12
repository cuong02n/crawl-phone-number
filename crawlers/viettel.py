import requests

from core.base_crawler import BaseCrawler
from core.config import build_proxies, load_config
from core.job_store import JobStore

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

    def fetch(self, pattern: str) -> list[str]:
        config = load_config()
        resp = requests.post(
            self.API_URL,
            headers=_HEADERS,
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

        data = resp.json()
        if data.get("errorCode") != 0:
            raise ValueError(
                f"API errorCode={data.get('errorCode')} msg={data.get('message', '')}"
            )

        return [
            "0" + str(item["isdn"]) if len(str(item["isdn"])) == 9 else str(item["isdn"])
            for item in data.get("data", [])
            if item.get("isdn")
        ]
