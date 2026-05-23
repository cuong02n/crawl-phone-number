"""
Auto-fetch Viettel credentials using Playwright.

Fetches only what the crawler needs:
  - laravel_session  (session cookie)
  - D1N              (anti-bot cookie)
  - x_csrf_token     (CSRF token from <meta> or XSRF-TOKEN cookie)

JS files are cached to cache/viettel_js/ so subsequent runs skip the proxy
for script downloads — only the HTML document and XHR calls go through proxy.
Cache TTL is 24 h; stale files are re-fetched automatically.
"""
import asyncio
import hashlib
import json
import os
import time
import uuid

from playwright.async_api import async_playwright

from core.config import load_config

TARGET_URL    = "https://vietteltelecom.vn/di-dong/sim-so"
_TIMEOUT      = 60_000        # ms — budget for first-byte + cookie polling combined
_JS_CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cache", "viettel_js")
_JS_CACHE_TTL = 24 * 3600    # seconds — re-download JS after 24 h
_BLOCK_TYPES  = {"image", "stylesheet", "font", "media"}   # never needed for cookies

SESSION_CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cache", "viettel_session.json")
SESSION_TTL        = 60 * 60  # seconds — reuse session for 1 hour before re-fetching


# ── Core fetch ──────────────────────────────────────────────────────────────────

async def _fetch_credentials(
    proxy_server: str | None, proxy_user: str | None, proxy_pass: str | None, on_step=None
) -> dict:

    def step(msg: str):
        if on_step:
            on_step(msg)

    # ── JS cache status ────────────────────────────────────────────────────────
    os.makedirs(_JS_CACHE_DIR, exist_ok=True)
    all_js = [f for f in os.listdir(_JS_CACHE_DIR) if f.endswith(".js")]
    fresh  = sum(
        1 for f in all_js
        if time.time() - os.path.getmtime(os.path.join(_JS_CACHE_DIR, f)) < _JS_CACHE_TTL
    )
    if fresh:
        step(f"📦 JS cache: {fresh}/{len(all_js)} file còn hạn — sẽ dùng local, không qua proxy")
    else:
        step("📦 JS cache: trống — sẽ tải JS lần đầu và cache lại")

    if proxy_server:
        step(f"🚀 Khởi động Chromium qua proxy…")
    else:
        step(f"🚀 Khởi động Chromium (không proxy — IP máy)…")
    async with async_playwright() as pw:
        launch_kwargs = {"headless": True}
        if proxy_server:
            launch_kwargs["proxy"] = {
                "server": proxy_server, "username": proxy_user, "password": proxy_pass
            }
        browser = await pw.chromium.launch(**launch_kwargs)
        step("✓ Chromium sẵn sàng")
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0"
            ),
            ignore_https_errors=True,
        )
        page = await context.new_page()

        # ── Route handler ──────────────────────────────────────────────────────
        js_cache_hit = [0]
        js_fetched   = [0]
        blocked      = [0]

        async def handle_route(route):
            rtype = route.request.resource_type

            # Heavy resources: abort — zero proxy calls, zero wait time
            if rtype in _BLOCK_TYPES:
                blocked[0] += 1
                await route.abort()
                return

            # Scripts: serve from local cache when available
            if rtype == "script":
                key        = hashlib.sha1(route.request.url.encode()).hexdigest()[:16]
                cache_path = os.path.join(_JS_CACHE_DIR, f"{key}.js")

                if os.path.exists(cache_path):
                    age = time.time() - os.path.getmtime(cache_path)
                    if age < _JS_CACHE_TTL:
                        try:
                            with open(cache_path, "rb") as fh:
                                body = fh.read()
                            js_cache_hit[0] += 1
                            await route.fulfill(
                                status=200,
                                headers={"content-type": "application/javascript; charset=utf-8"},
                                body=body,
                            )
                            return
                        except Exception:
                            pass  # corrupt/stale → fall through to network

                # Not cached (or stale): fetch through proxy and store
                try:
                    resp = await route.fetch()
                    body = await resp.body()
                    try:
                        with open(cache_path, "wb") as fh:
                            fh.write(body)
                        js_fetched[0] += 1
                    except Exception:
                        pass
                    await route.fulfill(response=resp)
                except Exception:
                    await route.continue_()
                return

            # Everything else (document, xhr, fetch, …): pass through
            await route.continue_()

        await page.route("**/*", handle_route)

        # ── DOM progress events (fire asynchronously while we poll cookies) ──
        def _on_dom(_=None):
            step(
                f"✓ DOM loaded  "
                f"(JS {js_cache_hit[0]} cached / {js_fetched[0]} proxy, "
                f"chặn {blocked[0]})"
            )

        def _on_load(_=None):
            step(
                f"✓ Page load  "
                f"(JS {js_cache_hit[0]} cached / {js_fetched[0]} proxy, "
                f"chặn {blocked[0]})"
            )

        page.on("domcontentloaded", _on_dom)
        page.on("load", _on_load)

        # ── Navigate (with retry — Viettel sometimes resets the first TCP) ────
        step(f"📄 GET {TARGET_URL}")
        t0 = time.time()

        try:
            # "commit" = first response bytes → cookies from Set-Cookie headers
            # are already available; anti-bot JS sets D1N shortly after.
            await _goto_with_retry(page, TARGET_URL, timeout=_TIMEOUT, on_step=step, no_proxy=(proxy_server is None))
            ms = int((time.time() - t0) * 1000)
            step(f"✓ Server phản hồi {ms} ms — đang tải page nền…")

            step("⏳ Chờ laravel_session + D1N…")
            await _wait_for_cookies(
                context,
                required=["laravel_session", "D1N"],
                timeout=_TIMEOUT,
                on_step=step,
            )

            cookies = {c["name"]: c["value"] for c in await context.cookies()}
            got = [k for k in ("laravel_session", "D1N", "XSRF-TOKEN") if cookies.get(k)]
            step(f"✓ Cookies: {' · '.join(got)}")

            # Wait for DOM so <meta name="csrf-token"> is parseable
            try:
                await page.wait_for_load_state("domcontentloaded", timeout=10_000)
            except Exception:
                pass  # already past domcontentloaded, or too slow — use cookie fallback

            # Prefer short token from <meta name="csrf-token">; fall back to
            # URL-decoded XSRF-TOKEN cookie (both are set by Laravel).
            meta_csrf = await page.evaluate(
                "document.querySelector('meta[name=\"csrf-token\"]')"
                "?.getAttribute('content') || ''"
            )
            from urllib.parse import unquote
            csrf = meta_csrf or unquote(cookies.get("XSRF-TOKEN", ""))

            src = "meta tag" if meta_csrf else "XSRF-TOKEN cookie"
            step(f"✓ csrf từ {src}: {csrf[:16]}…")

        finally:
            await browser.close()
            step(
                f"✓ Done  (JS: {js_cache_hit[0]} cache / {js_fetched[0]} proxy, "
                f"chặn {blocked[0]} resource)"
            )

        cookie_str = "; ".join(
            f"{k}={v}" for k, v in cookies.items()
            if k in ("D1N", "laravel_session")
        )
        return {
            "x_csrf_token": csrf,
            "cookie": cookie_str,
        }


async def _goto_with_retry(page, url: str, timeout: int, on_step=None, no_proxy: bool = False):
    """
    page.goto with up to 3 attempts and a diagnostic error message.

    Viettel occasionally resets the first TCP handshake (ERR_CONNECTION_RESET)
    when the proxy IP is new or under load. Retrying with a small back-off
    usually succeeds on attempt 2-3.
    """
    def step(msg: str):
        if on_step:
            on_step(msg)

    last_exc: Exception | None = None
    for attempt in range(1, 4):
        try:
            await page.goto(url, timeout=timeout, wait_until="commit")
            if attempt > 1:
                step(f"✓ goto OK ở lần thử {attempt}")
            return
        except Exception as e:
            last_exc = e
            err_short = str(e).splitlines()[0][:200]
            step(f"⚠ goto attempt {attempt}/3 thất bại: {err_short}")
            if attempt < 3:
                await asyncio.sleep(1.5 * attempt)  # 1.5s, 3s

    # Diagnose root cause for the human-readable error
    err_str = str(last_exc)
    hint = ""
    if "CONNECTION_RESET" in err_str or "ECONNRESET" in err_str:
        if no_proxy:
            hint = (
                "  IP máy có thể bị Viettel chặn (region/ASN). "
                "→ Cấu hình proxy ở Settings và bỏ tick 'Không dùng proxy'."
            )
        else:
            hint = (
                "  Proxy IP có thể bị Viettel chặn hoặc proxy provider đang lỗi. "
                "→ Thử bấm '🔄 Làm mới' để lấy IP khác; nếu vẫn fail, đổi proxy provider."
            )
    elif "TIMEOUT" in err_str or "timeout" in err_str.lower() or "Timeout" in err_str:
        hint = (
            "  Server không trả response trong thời gian chờ. "
            "→ Có thể proxy chậm hoặc Viettel maintenance. Thử lại sau 1-2 phút."
        )
    elif "NAME_NOT_RESOLVED" in err_str or "DNS" in err_str:
        hint = "  Lỗi DNS — kiểm tra mạng + cấu hình proxy."
    elif "TUNNEL_CONNECTION_FAILED" in err_str or "PROXY" in err_str.upper():
        hint = "  Lỗi proxy tunnel — kiểm tra username/password proxy ở Settings."

    raise RuntimeError(f"Page.goto fail sau 3 lần thử: {err_str}\n{hint}") from last_exc


async def _wait_for_cookies(context, required: list[str], timeout: int, on_step=None):
    """Poll until every cookie in `required` is non-empty, or raise TimeoutError."""
    deadline    = time.time() + timeout / 1000
    last_report = time.time()
    while time.time() < deadline:
        jar     = {c["name"]: c["value"] for c in await context.cookies()}
        missing = [n for n in required if not jar.get(n)]
        if not missing:
            return
        now = time.time()
        if on_step and now - last_report >= 3:
            remaining = int(deadline - now)
            on_step(f"  … chờ {', '.join(missing)} (còn ~{remaining}s)")
            last_report = now
        await asyncio.sleep(0.4)

    jar     = {c["name"]: c["value"] for c in await context.cookies()}
    missing = [n for n in required if not jar.get(n)]
    raise TimeoutError(f"Cookie(s) chưa có sau {timeout // 1000}s: {', '.join(missing)}")


# ── Proxy helpers ───────────────────────────────────────────────────────────────

def _build_proxy_args(config: dict, proxy_session_id: str | None = None) -> tuple[str, str, str, str]:
    proxy_dns = config.get("proxy_dns", "").strip()
    if not proxy_dns:
        raise RuntimeError("Proxy chưa được cấu hình trong Settings")
    session_id = proxy_session_id or uuid.uuid4().hex[:8]
    username   = config.get("username", "").strip()
    password   = config.get("password", "").strip()
    if username:
        username = f"{username}-session-{session_id}"
    return session_id, f"http://{proxy_dns}", username, password


# ── Session cache ───────────────────────────────────────────────────────────────

def _ensure_cache_dir():
    os.makedirs(os.path.join(os.path.dirname(os.path.dirname(__file__)), "cache"), exist_ok=True)


def load_session_cache() -> dict | None:
    """Return cached session if it exists and is within SESSION_TTL, else None."""
    try:
        with open(SESSION_CACHE_PATH) as f:
            data = json.load(f)
        age = time.time() - data.get("fetched_at", 0)
        if age < SESSION_TTL:
            return data
    except Exception:
        pass
    return None


def save_session_cache(session: dict):
    _ensure_cache_dir()
    try:
        with open(SESSION_CACHE_PATH, "w") as f:
            json.dump({**session, "fetched_at": time.time()}, f)
    except Exception:
        pass


def clear_session_cache():
    try:
        os.remove(SESSION_CACHE_PATH)
    except FileNotFoundError:
        pass


def session_cache_remaining() -> int:
    """Seconds remaining before the cached session expires. 0 if no valid cache."""
    try:
        with open(SESSION_CACHE_PATH) as f:
            data = json.load(f)
        remaining = SESSION_TTL - (time.time() - data.get("fetched_at", 0))
        return max(0, int(remaining))
    except Exception:
        return 0


# ── Public API ──────────────────────────────────────────────────────────────────

async def async_fetch_viettel_credentials(
    proxy_session_id: str | None = None, no_proxy: bool = False
) -> dict:
    """Async entry point for FastAPI UI endpoints. Caller is responsible for save_session_cache()."""
    import concurrent.futures
    if no_proxy:
        session_id     = proxy_session_id or uuid.uuid4().hex[:8]
        proxy_server   = username = password = None
    else:
        config = load_config()
        session_id, proxy_server, username, password = _build_proxy_args(config, proxy_session_id)
    loop = asyncio.get_event_loop()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        result = await loop.run_in_executor(
            pool,
            lambda: asyncio.run(_fetch_credentials(proxy_server, username, password)),
        )
    result["proxy_session_id"] = session_id
    return result


def fetch_viettel_credentials(
    proxy_session_id: str | None = None, no_proxy: bool = False
) -> dict:
    """Sync wrapper used by ViettelCrawler._refresh_session().
    Does NOT touch the UI session cache — the cache is per UI-session, not per crawler job.
    """
    if no_proxy:
        session_id     = proxy_session_id or uuid.uuid4().hex[:8]
        proxy_server   = username = password = None
    else:
        config = load_config()
        session_id, proxy_server, username, password = _build_proxy_args(config, proxy_session_id)
    result = asyncio.run(_fetch_credentials(proxy_server, username, password))
    result["proxy_session_id"] = session_id
    return result
