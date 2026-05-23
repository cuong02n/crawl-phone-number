import asyncio
import glob
import json
import os
import re
import sys
import threading
import uuid
from contextlib import asynccontextmanager

import pandas as pd
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(__file__))

from core.config import load_config, save_config
from core.viettel_auth import (
    async_fetch_viettel_credentials,
    load_session_cache,
    save_session_cache,
    clear_session_cache,
    session_cache_remaining,
    SESSION_TTL,
)
from core.filters import PRESETS, resolve_preset
from core.job_store import DATA_DIR, JobStatus, JobStore
from crawlers.viettel import ViettelCrawler
from crawlers.vnpt import VNPTCrawler
from crawlers.vietnamobile import VietnamobileCrawler

# ── Setup ──────────────────────────────────────────────────────────────────────

_broadcast_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _broadcast_task
    print("[WS] startup — creating broadcast task", flush=True)
    _broadcast_task = asyncio.create_task(_broadcast())
    print(f"[WS] broadcast task created: {_broadcast_task}", flush=True)
    yield
    if _broadcast_task:
        _broadcast_task.cancel()
        try:
            await _broadcast_task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Sim Crawler API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

store = JobStore()
_crawlers: dict[str, ViettelCrawler | VNPTCrawler | VietnamobileCrawler] = {}

# Fix any RUNNING jobs from a previous crashed process
for _job in store.list_jobs():
    if _job["status"] == JobStatus.RUNNING:
        store.set_status(_job["id"], JobStatus.PAUSED)


# ── WebSocket ──────────────────────────────────────────────────────────────────

_ws_clients: set[WebSocket] = set()


def _read_log_tail(log_file: str, lines: int = 80) -> str:
    if not log_file or not os.path.exists(log_file):
        return ""
    try:
        with open(log_file, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            # Each log line ≈ 120 bytes; read enough from the end to cover `lines`
            f.seek(max(0, size - lines * 120))
            raw = f.read().decode("utf-8", errors="ignore")
        all_lines = raw.splitlines(keepends=True)
        # If we started mid-line, drop the incomplete first line
        if size > lines * 120:
            all_lines = all_lines[1:]
        return "".join(all_lines[-lines:])
    except Exception:
        return ""


_THREAD_TAG_RE = re.compile(r'\[T(\d+)\]')
_LOG_TIME_RE   = re.compile(r'(\d{2}:\d{2}:\d{2})')
_LOG_LEVEL_RE  = re.compile(r'\s(INFO|WARNING|ERROR|DEBUG|CRITICAL)\s')


def _parse_thread_logs(log_file: str, tail: int = 60) -> dict:
    """Group last `tail` log lines by [T{n}] thread marker."""
    raw = _read_log_tail(log_file, tail)
    threads: dict[int, list] = {}
    for line in raw.splitlines():
        m = _THREAD_TAG_RE.search(line)
        if not m:
            continue
        t_num   = int(m.group(1))
        prefix  = line[:m.start()]
        time_m  = _LOG_TIME_RE.search(prefix)
        level_m = _LOG_LEVEL_RE.search(prefix)
        msg     = line[m.end():].strip()
        if not msg:
            continue
        threads.setdefault(t_num, []).append({
            "time":  time_m.group(1)  if time_m  else "",
            "level": level_m.group(1) if level_m else "INFO",
            "msg":   msg,
        })
    return threads


def _ws_payload() -> dict:
    jobs = store.list_jobs()
    running = sum(1 for j in jobs if j["status"] == JobStatus.RUNNING)
    total_saved = sum(j["total_saved"] for j in jobs)
    progresses = [store.get_progress(j["id"])["percent"] for j in jobs if j["total_saved"] > 0]
    avg_progress = round(sum(progresses) / len(progresses), 1) if progresses else 0

    numbers = []
    for csv_file in sorted(glob.glob(os.path.join(DATA_DIR, "*.csv"))):
        try:
            with open(csv_file, "rb") as f:
                f.seek(0, 2)
                f.seek(max(0, f.tell() - 60 * 14))
                lines = [ln.strip() for ln in f.read().decode("utf-8", errors="ignore").split("\n") if ln.strip()]
                numbers.extend(lines)
        except Exception:
            pass

    return {
        "jobs": [
            {
                **job,
                "threads": json.loads(job.get("meta") or "{}").get("threads", 1),
                "progress": store.get_progress(job["id"]),
                "log": _read_log_tail(job.get("log_file", "")),
                "fail_reason": job.get("fail_reason") or "",
                "live_stats": _live_stats(job["id"]),
            }
            for job in jobs
        ],
        "stats": {"total_jobs": len(jobs), "running_jobs": running,
                  "total_saved": total_saved, "avg_progress": avg_progress},
        "feed": list(dict.fromkeys(numbers))[-60:],
        "has_proxy": bool(load_config().get("proxy_dns", "").strip()),
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    _ws_clients.add(ws)
    print(f"[WS] client connected — total: {len(_ws_clients)}", flush=True)
    # Send a small ping first so the client knows the connection is live
    try:
        await ws.send_json({"_ping": True})
        print(f"[WS] ping sent", flush=True)
    except Exception as e:
        print(f"[WS] ping failed: {e}", flush=True)
    try:
        payload = await asyncio.to_thread(_ws_payload)
        await ws.send_json(payload)
        print(f"[WS] initial payload sent ({len(str(payload))} chars)", flush=True)
    except Exception as e:
        print(f"[WS] initial payload error: {e}", flush=True)
        import traceback; traceback.print_exc()
    try:
        while True:
            await ws.receive_text()
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        _ws_clients.discard(ws)
        print(f"[WS] client disconnected — total: {len(_ws_clients)}", flush=True)


async def _broadcast():
    import traceback as _tb
    try:
        cycle = 0
        while True:
            await asyncio.sleep(1)
            cycle += 1
            if not _ws_clients:
                if cycle % 10 == 0:
                    print(f"[WS] broadcast cycle {cycle}: no clients", flush=True)
                continue
            try:
                payload = await asyncio.to_thread(_ws_payload)
            except Exception as e:
                print(f"[WS] payload build error (cycle {cycle}): {e}", flush=True)
                _tb.print_exc()
                continue
            dead = set()
            for ws in list(_ws_clients):
                try:
                    await ws.send_json(payload)
                except Exception as e:
                    print(f"[WS] send error: {e}", flush=True)
                    dead.add(ws)
            _ws_clients.difference_update(dead)
            if cycle % 5 == 0:
                print(f"[WS] broadcast cycle {cycle}: sent to {len(_ws_clients)} client(s)", flush=True)
    except asyncio.CancelledError:
        print("[WS] _broadcast cancelled (shutdown)", flush=True)
        raise
    except BaseException as e:
        print(f"[WS] _broadcast CRASHED: {e}", flush=True)
        _tb.print_exc()
        raise



# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_crawler(job_id: str, network: str):
    if network == "viettel":
        return ViettelCrawler(job_id, store)
    if network == "vietnamobile":
        return VietnamobileCrawler(job_id, store)
    return VNPTCrawler(job_id, store)


def _live_stats(job_id: str) -> dict:
    """Return in-memory counters from the active crawler (empty if not running)."""
    c = _crawlers.get(job_id)
    if c and hasattr(c, "get_stats"):
        try:
            return c.get_stats()
        except Exception:
            return {}
    return {}


def _start(job_id: str, network: str):
    crawler = _make_crawler(job_id, network)
    _crawlers[job_id] = crawler
    meta = store.get_meta(job_id)
    threads = int(meta.get("threads", 1))
    threading.Thread(target=crawler.run, kwargs={"threads": threads}, daemon=True).start()


def _pause(job_id: str):
    store.set_status(job_id, JobStatus.PAUSED)
    c = _crawlers.get(job_id)
    if c:
        c.pause()


# ── Models ─────────────────────────────────────────────────────────────────────

class CreateJobRequest(BaseModel):
    network: str
    pattern: str = "0?????????"
    x_csrf_token: str = ""
    cookie: str = ""
    proxy_session_id: str = ""
    threads: int = 1
    no_proxy: bool = False
    isdn_type: int = 2          # Viettel only: 2 = trả trước, 22 = trả sau
    token: str = ""             # Vietnamobile only: URL token (?token=...)


class ResumeJobRequest(BaseModel):
    threads: int | None = None
    x_csrf_token: str = ""
    cookie: str = ""
    proxy_session_id: str = ""
    no_proxy: bool | None = None
    token: str = ""             # Vietnamobile only


class UpdateThreadsRequest(BaseModel):
    threads: int


class ProxyConfig(BaseModel):
    proxy_dns: str
    username: str
    password: str
    proxy_mode: str = "sticky"


class FilterRequest(BaseModel):
    file: str
    presets: list[str] = []
    limit: int = 200


# ── Config ─────────────────────────────────────────────────────────────────────

@app.get("/api/ws-debug")
def ws_debug():
    status = "none"
    exc_info = None
    if _broadcast_task is not None:
        if not _broadcast_task.done():
            status = "running"
        elif _broadcast_task.cancelled():
            status = "cancelled"
        else:
            exc = _broadcast_task.exception()
            status = "failed" if exc else "completed_unexpectedly"
            exc_info = repr(exc) if exc else None
    return {
        "clients": len(_ws_clients),
        "broadcast_task": status,
        "broadcast_exception": exc_info,
    }


@app.get("/api/viettel/session")
def get_viettel_session():
    """Return cached session info without launching a browser."""
    cached = load_session_cache()
    if cached:
        remaining = session_cache_remaining()
        return {"cached": True, "remaining_seconds": remaining, "session": cached}
    return {"cached": False, "remaining_seconds": 0, "session": None}


@app.delete("/api/viettel/session")
def delete_viettel_session():
    clear_session_cache()
    return {"status": "cleared"}


@app.post("/api/viettel/auto-session")
async def viettel_auto_session(no_proxy: bool = False):
    """Launch headless browser to auto-fetch Viettel credentials (with or without proxy)."""
    import traceback
    try:
        creds = await async_fetch_viettel_credentials(no_proxy=no_proxy)
        return {
            "x_csrf_token": creds["x_csrf_token"],
            "cookie": creds["cookie"],
            "proxy_session_id": creds["proxy_session_id"],
        }
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[AUTO-SESSION ERROR] {type(e).__name__}: {e}\n{tb}", flush=True)
        status = 400 if isinstance(e, RuntimeError) else 500
        raise HTTPException(status_code=status, detail=f"{type(e).__name__}: {e}")


@app.get("/api/viettel/auto-session/stream")
async def viettel_auto_session_stream(force: bool = False, no_proxy: bool = False):
    """SSE endpoint — returns cached session instantly, or fetches fresh via browser.
    With no_proxy=true, launches the browser directly (no proxy)."""
    import json as _json
    import concurrent.futures
    import traceback as _tb
    from core.viettel_auth import _build_proxy_args, _fetch_credentials, save_session_cache

    queue: asyncio.Queue = asyncio.Queue()
    main_loop = asyncio.get_running_loop()

    def on_step(msg: str):
        main_loop.call_soon_threadsafe(queue.put_nowait, {"type": "step", "msg": msg})

    async def run_bg():
        try:
            # ── Use cache if fresh and not forced ──────────────────────────────
            if not force:
                cached = load_session_cache()
                if cached:
                    remaining = session_cache_remaining()
                    m, s = divmod(remaining, 60)
                    await queue.put({"type": "step", "msg": f"📦 Session cache còn hạn ({m}m {s}s) — dùng lại, không cần mở browser"})
                    await queue.put({"type": "done", "result": cached})
                    return

            # ── Fresh fetch via browser ────────────────────────────────────────
            if no_proxy:
                await queue.put({"type": "step", "msg": "🏠 Chế độ không proxy — gọi trực tiếp từ IP máy"})
                session_id  = uuid.uuid4().hex[:8]
                proxy_server = proxy_user = proxy_pass = None
            else:
                config = load_config()
                if not config.get("proxy_dns", "").strip():
                    await queue.put({"type": "error", "msg": "Chưa cấu hình proxy. Vào Settings trước."})
                    return
                session_id, proxy_server, proxy_user, proxy_pass = _build_proxy_args(config)
                await queue.put({"type": "step", "msg": f"🔑 Session ID: {session_id}"})
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                result = await main_loop.run_in_executor(
                    pool,
                    lambda: asyncio.run(
                        _fetch_credentials(proxy_server, proxy_user, proxy_pass, on_step=on_step)
                    ),
                )
            result["proxy_session_id"] = session_id
            save_session_cache(result)
            remaining = SESSION_TTL
            m, s = divmod(remaining, 60)
            await queue.put({"type": "step", "msg": f"💾 Session đã cache — dùng được {m}m nữa"})
            await queue.put({"type": "done", "result": result})
        except Exception as e:
            print(f"[AUTO-SESSION STREAM ERROR] {type(e).__name__}: {e}", flush=True)
            _tb.print_exc()
            await queue.put({"type": "error", "msg": f"{type(e).__name__}: {e}"})

    asyncio.create_task(run_bg())

    async def generate():
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=90.0)
            except asyncio.TimeoutError:
                yield f"data: {_json.dumps({'type': 'error', 'msg': 'Timeout sau 90 giây'}, ensure_ascii=False)}\n\n"
                break
            yield f"data: {_json.dumps(item, ensure_ascii=False)}\n\n"
            if item["type"] in ("done", "error"):
                break

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/config")
def get_config():
    return load_config()


@app.post("/api/config")
def update_config(config: ProxyConfig):
    save_config(config.model_dump())
    return {"status": "ok"}


# ── Stats ──────────────────────────────────────────────────────────────────────

@app.get("/api/stats")
def get_stats():
    jobs = store.list_jobs()
    running = sum(1 for j in jobs if j["status"] == JobStatus.RUNNING)
    total_saved = sum(j["total_saved"] for j in jobs)
    progresses = [
        store.get_progress(j["id"])["percent"]
        for j in jobs
        if j["total_saved"] > 0
    ]
    avg_progress = round(sum(progresses) / len(progresses), 1) if progresses else 0
    return {
        "total_jobs": len(jobs),
        "running_jobs": running,
        "total_saved": total_saved,
        "avg_progress": avg_progress,
    }


# ── Jobs ───────────────────────────────────────────────────────────────────────

@app.get("/api/jobs")
def list_jobs():
    return [
        {
            **job,
            "threads": json.loads(job.get("meta") or "{}").get("threads", 1),
            "progress": store.get_progress(job["id"]),
            "live_stats": _live_stats(job["id"]),
        }
        for job in store.list_jobs()
    ]


@app.post("/api/jobs")
def create_job(body: CreateJobRequest):
    if body.network not in ("viettel", "vnpt", "vietnamobile"):
        raise HTTPException(400, "network must be 'viettel', 'vnpt' or 'vietnamobile'")
    cfg = load_config()
    # VNPT always requires proxy; Viettel/Vietnamobile only if no_proxy flag is False.
    needs_proxy = body.network == "vnpt" or not body.no_proxy
    if needs_proxy and not cfg.get("proxy_dns", "").strip():
        raise HTTPException(400, "Chưa cấu hình proxy. Vào Settings để nhập proxy trước khi chạy.")
    if body.network == "viettel" and not body.x_csrf_token.strip():
        raise HTTPException(400, "Viettel yêu cầu x-csrf-token.")
    if body.network == "viettel" and not body.cookie.strip():
        raise HTTPException(400, "Viettel yêu cầu cookie.")
    if body.network == "viettel" and body.isdn_type not in (2, 22):
        raise HTTPException(400, "isdn_type chỉ chấp nhận 2 (trả trước) hoặc 22 (trả sau).")
    if body.network == "vietnamobile" and not body.token.strip():
        raise HTTPException(400, "Vietnamobile yêu cầu token (lấy từ URL request DevTools).")
    if body.network == "viettel":
        seed = body.pattern
        meta = {
            "x_csrf_token":     body.x_csrf_token,
            "cookie":           body.cookie,
            "proxy_session_id": body.proxy_session_id,
            "no_proxy":         body.no_proxy,
            "isdn_type":        body.isdn_type,
        }
    elif body.network == "vietnamobile":
        seed = "all"  # crawler seeds digit roots itself
        meta = {
            "token":    body.token.strip(),
            "no_proxy": body.no_proxy,
        }
    else:  # vnpt
        seed = "all"
        meta = {}
    meta["threads"] = max(1, min(50, body.threads))
    job_id = store.create_job(body.network, seed, meta)
    _start(job_id, body.network)
    return {"job_id": job_id}


@app.post("/api/jobs/{job_id}/pause")
def pause_job(job_id: str):
    _pause(job_id)
    return {"status": "pausing"}


@app.post("/api/jobs/{job_id}/resume")
def resume_job(job_id: str, body: ResumeJobRequest = ResumeJobRequest()):
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    meta = store.get_meta(job_id)
    if body.threads is not None:
        meta["threads"] = max(1, min(50, body.threads))
    if body.x_csrf_token.strip():
        meta["x_csrf_token"] = body.x_csrf_token.strip()
    if body.cookie.strip():
        meta["cookie"] = body.cookie.strip()
    if body.proxy_session_id.strip():
        meta["proxy_session_id"] = body.proxy_session_id.strip()
    if body.no_proxy is not None:
        meta["no_proxy"] = body.no_proxy
    if body.token.strip():
        meta["token"] = body.token.strip()
    store.set_meta(job_id, meta)
    _start(job_id, job["network"])
    return {"status": "resuming"}


@app.post("/api/jobs/{job_id}/threads")
def update_threads(job_id: str, body: UpdateThreadsRequest):
    n = max(1, min(50, body.threads))
    meta = store.get_meta(job_id)
    meta["threads"] = n
    store.set_meta(job_id, meta)
    c = _crawlers.get(job_id)
    if c:
        c.set_threads(n)
    return {"threads": n}


@app.post("/api/jobs/{job_id}/retry")
def retry_job(job_id: str):
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    store.requeue_failed(job_id)
    _start(job_id, job["network"])
    return {"status": "retrying"}


@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: str):
    _pause(job_id)
    store.delete_job(job_id)
    _crawlers.pop(job_id, None)
    return {"status": "deleted"}


@app.get("/api/jobs/{job_id}/log")
def get_log(job_id: str, lines: int = 80):
    log_file = store.get_log_file(job_id)
    if not log_file or not os.path.exists(log_file):
        return {"log": ""}
    try:
        with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
            all_lines = f.readlines()
        return {"log": "".join(all_lines[-lines:])}
    except Exception as e:
        return {"log": f"Lỗi: {e}"}


@app.get("/api/jobs/{job_id}/thread-logs")
def get_thread_logs(job_id: str, tail: int = 60):
    log_file = store.get_log_file(job_id)
    if not log_file or not os.path.exists(log_file):
        return {"threads": {}}
    return {"threads": _parse_thread_logs(log_file, tail)}


@app.get("/api/jobs/{job_id}/failed-patterns")
def get_failed_patterns(job_id: str, limit: int = 200):
    rows = store.conn.execute(
        "SELECT pattern FROM queue WHERE job_id=? AND status='failed' LIMIT ?",
        (job_id, limit),
    ).fetchall()
    return {"patterns": [r["pattern"] for r in rows]}


# ── Live feed ──────────────────────────────────────────────────────────────────

@app.get("/api/feed/recent")
def recent_numbers(limit: int = 60):
    """Return last `limit` numbers collected across all output CSV files."""
    numbers = []
    for csv_file in sorted(glob.glob(os.path.join(DATA_DIR, "*.csv"))):
        try:
            with open(csv_file, "rb") as f:
                f.seek(0, 2)
                size = f.tell()
                f.seek(max(0, size - limit * 14))
                content = f.read().decode("utf-8", errors="ignore")
                lines = [ln.strip() for ln in content.split("\n") if ln.strip()]
                numbers.extend(lines)
        except Exception:
            pass
    seen = dict.fromkeys(numbers)
    return {"numbers": list(seen)[-limit:]}


# ── Data / Explorer ────────────────────────────────────────────────────────────

@app.get("/api/data/files")
def list_data_files():
    files = sorted(glob.glob(os.path.join(DATA_DIR, "*.csv")))
    return [
        {"path": f, "name": os.path.basename(f), "size": os.path.getsize(f)}
        for f in files
    ]


@app.post("/api/data/preview")
def preview_data(body: FilterRequest):
    if not os.path.exists(body.file):
        raise HTTPException(404, "File not found")
    try:
        fns = [fn for n in body.presets if (fn := resolve_preset(n)) is not None]
        filter_fn = (lambda num: all(fn(num) for fn in fns)) if fns else None
        numbers: list[str] = []
        total = 0
        filtered = 0
        with open(body.file, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                num = line.strip()
                if not num:
                    continue
                total += 1
                if filter_fn is None or filter_fn(num):
                    filtered += 1
                    if len(numbers) < body.limit:
                        numbers.append(num)
        return {
            "numbers": numbers,
            "filtered_count": filtered if filter_fn else total,
            "total_count": total,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/data/download")
def download_file(path: str):
    if not os.path.exists(path):
        raise HTTPException(404, "File not found")
    return FileResponse(path, filename=os.path.basename(path))


# ── Serve built React app ──────────────────────────────────────────────────────
# Run `npm run build` in ui/, then this serves it at http://localhost:8000

_dist = os.path.join(os.path.dirname(__file__), "ui", "dist")
if os.path.isdir(_dist):
    app.mount("/", StaticFiles(directory=_dist, html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=9000, reload=True)
