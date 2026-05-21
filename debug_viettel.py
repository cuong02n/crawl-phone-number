"""
Debug script: gửi 1 request đến Viettel API và dump toàn bộ response.

Usage:
    python debug_viettel.py
    python debug_viettel.py --pattern 0901234567
    python debug_viettel.py --expired   (dùng cookie giả để xem response khi hết hạn)
"""
import argparse
import json
import sys
import os

import requests

sys.path.insert(0, os.path.dirname(__file__))
from core.config import build_proxies, load_config

API_URL = "https://vietteltelecom.vn/api/get/sim"

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


def dump_response(resp: requests.Response):
    print(f"\n{'='*60}")
    print(f"STATUS : {resp.status_code} {resp.reason}")
    print(f"URL    : {resp.url}")
    print(f"\n--- Request Headers ---")
    for k, v in resp.request.headers.items():
        # ẩn bớt cookie dài
        if k.lower() == "cookie":
            print(f"  {k}: {v[:120]}{'...' if len(v) > 120 else ''}")
        else:
            print(f"  {k}: {v}")

    print(f"\n--- Response Headers ---")
    for k, v in resp.headers.items():
        print(f"  {k}: {v}")

    print(f"\n--- Response Cookies ---")
    for k, v in resp.cookies.items():
        print(f"  {k}={v}")

    print(f"\n--- Response Body ---")
    try:
        data = resp.json()
        print(json.dumps(data, ensure_ascii=False, indent=2))
        print(f"\n--- Parsed ---")
        print(f"  errorCode : {data.get('errorCode')}")
        print(f"  message   : {data.get('message')}")
        print(f"  data count: {len(data.get('data', []))}")
        print(f"  totalItems: {data.get('totalItems')}")
    except Exception:
        print(resp.text[:2000])
    print(f"{'='*60}\n")


def make_session(x_csrf_token: str, cookie: str) -> requests.Session:
    s = requests.Session()
    s.headers.update(_HEADERS)
    s.headers["x-csrf-token"] = x_csrf_token
    for part in cookie.split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            s.cookies.set(k.strip(), v.strip())
    return s


def send(session: requests.Session, pattern: str, proxies: dict):
    print(f"\nSending request: pattern={pattern!r}")
    try:
        resp = session.post(
            API_URL,
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
        dump_response(resp)
    except requests.exceptions.ProxyError as e:
        print(f"\n[PROXY ERROR] {e}")
    except requests.exceptions.Timeout:
        print(f"\n[TIMEOUT] Request timed out after 15s")
    except Exception as e:
        print(f"\n[ERROR] {type(e).__name__}: {e}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pattern", default="09012?????", help="Pattern to search")
    parser.add_argument("--csrf",    default="", help="x-csrf-token (override config)")
    parser.add_argument("--cookie",  default="", help="Cookie string (override config)")
    parser.add_argument("--expired", action="store_true",
                        help="Use fake/expired credentials to observe error response")
    parser.add_argument("--no-proxy", action="store_true", help="Disable proxy")
    args = parser.parse_args()

    config = load_config()
    proxies = {} if args.no_proxy else build_proxies(config)
    print(f"Proxy: {proxies or '(none)'}")

    if args.expired:
        print("\n[MODE] Using FAKE credentials to observe expiry response")
        session = make_session(
            x_csrf_token="fake_expired_token_12345",
            cookie="D1N=fake_d1n_value; laravel_session=fake_session_value",
        )
        send(session, args.pattern, proxies)
        return

    # Real credentials — từ args hoặc nhập tay
    csrf = args.csrf
    cookie = args.cookie

    if not csrf or not cookie:
        print("Nhập credentials (lấy từ DevTools → Network → Copy as cURL):")
        if not csrf:
            csrf = input("  x-csrf-token: ").strip()
        if not cookie:
            cookie = input("  Cookie: ").strip()

    if not csrf or not cookie:
        print("ERROR: cần cả x-csrf-token và cookie")
        sys.exit(1)

    session = make_session(csrf, cookie)

    print(f"\n--- Test 1: pattern hợp lệ ---")
    send(session, args.pattern, proxies)

    print(f"\n--- Test 2: pattern rỗng (edge case) ---")
    send(session, "", proxies)

    more = input("\nThêm pattern để test? (Enter để bỏ qua): ").strip()
    if more:
        send(session, more, proxies)


if __name__ == "__main__":
    main()
