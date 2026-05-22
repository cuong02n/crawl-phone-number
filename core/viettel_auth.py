"""
Auto-fetch Viettel credentials using Playwright.

Launches a headless Chromium via the sticky proxy IP, navigates to the SIM
search page, waits for the session cookies to be set, then extracts:
  - x_csrf_token
  - cookie string (D1N + laravel_session)
  - proxy_session_id  (reuse this same sticky IP for the crawler)
"""
import asyncio
import uuid

from playwright.async_api import async_playwright

from core.config import build_proxies, load_config

TARGET_URL = "https://vietteltelecom.vn/di-dong/sim-so"
_TIMEOUT = 30_000  # ms


async def _fetch_credentials(proxy_server: str, proxy_user: str, proxy_pass: str) -> dict:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            proxy={
                "server": proxy_server,
                "username": proxy_user,
                "password": proxy_pass,
            },
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0"
            ),
            ignore_https_errors=True,
        )
        page = await context.new_page()

        try:
            await page.goto(TARGET_URL, timeout=_TIMEOUT, wait_until="domcontentloaded")
            await _wait_for_cookie(context, "laravel_session", timeout=_TIMEOUT)

            cookies = {c["name"]: c["value"] for c in await context.cookies()}

            # Try to get the short x-csrf-token from <meta name="csrf-token">
            meta_csrf = await page.evaluate(
                "document.querySelector('meta[name=\"csrf-token\"]')?.getAttribute('content') || ''"
            )
        finally:
            await browser.close()

        from urllib.parse import unquote
        # Prefer meta csrf-token (short alphanumeric); fall back to XSRF-TOKEN cookie
        if meta_csrf:
            x_csrf_token = meta_csrf
        else:
            x_csrf_token = unquote(cookies.get("XSRF-TOKEN", ""))

        cookie_str = "; ".join(
            f"{k}={v}" for k, v in cookies.items()
            if k in ("D1N", "laravel_session", "XSRF-TOKEN")
        )

        return {
            "x_csrf_token": x_csrf_token,
            "cookie": cookie_str,
            "all_cookies": cookies,
        }


async def _wait_for_cookie(context, name: str, timeout: int):
    import time
    deadline = time.time() + timeout / 1000
    while time.time() < deadline:
        cookies = {c["name"]: c["value"] for c in await context.cookies()}
        if cookies.get(name):
            return
        await asyncio.sleep(0.5)
    raise TimeoutError(f"Cookie '{name}' not set within {timeout}ms")


def _build_proxy_args(config: dict) -> tuple[str, str, str, str]:
    """Returns (session_id, proxy_server, username, password)."""
    proxy_dns = config.get("proxy_dns", "").strip()
    if not proxy_dns:
        raise RuntimeError("Proxy chưa được cấu hình trong Settings")
    session_id = uuid.uuid4().hex[:8]
    username = config.get("username", "").strip()
    password = config.get("password", "").strip()
    if username:
        username = f"{username}-session-{session_id}"
    return session_id, f"http://{proxy_dns}", username, password


async def async_fetch_viettel_credentials() -> dict:
    """
    Async version for FastAPI endpoints.
    Playwright must run in its own thread+event loop to avoid conflicts with uvicorn.
    """
    import concurrent.futures
    config = load_config()
    session_id, proxy_server, username, password = _build_proxy_args(config)

    loop = asyncio.get_event_loop()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        result = await loop.run_in_executor(
            pool,
            lambda: asyncio.run(_fetch_credentials(proxy_server, username, password)),
        )
    result["proxy_session_id"] = session_id
    return result


def fetch_viettel_credentials() -> dict:
    """Sync wrapper for use outside async context (CLI/tests)."""
    config = load_config()
    session_id, proxy_server, username, password = _build_proxy_args(config)
    result = asyncio.run(_fetch_credentials(proxy_server, username, password))
    result["proxy_session_id"] = session_id
    return result
