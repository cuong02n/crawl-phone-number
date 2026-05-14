import glob
import os
import sys
import threading

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(__file__))

from core.config import load_config, save_config
from core.filters import PRESETS
from core.job_store import DATA_DIR, JobStatus, JobStore
from crawlers.viettel import ViettelCrawler
from crawlers.vnpt import VNPTCrawler

# ── Setup ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="Sim Crawler API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

store = JobStore()
_crawlers: dict[str, ViettelCrawler | VNPTCrawler] = {}

# Fix any RUNNING jobs from a previous crashed process
for _job in store.list_jobs():
    if _job["status"] == JobStatus.RUNNING:
        store.set_status(_job["id"], JobStatus.PAUSED)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_crawler(job_id: str, network: str):
    return ViettelCrawler(job_id, store) if network == "viettel" else VNPTCrawler(job_id, store)


def _start(job_id: str, network: str):
    crawler = _make_crawler(job_id, network)
    _crawlers[job_id] = crawler
    threading.Thread(target=crawler.run, daemon=True).start()


def _pause(job_id: str):
    c = _crawlers.get(job_id)
    if c:
        c.pause()


# ── Models ─────────────────────────────────────────────────────────────────────

class CreateJobRequest(BaseModel):
    network: str
    pattern: str = "09????????"


class ProxyConfig(BaseModel):
    proxy_dns: str
    username: str
    password: str


class FilterRequest(BaseModel):
    file: str
    presets: list[str] = []
    limit: int = 200


# ── Config ─────────────────────────────────────────────────────────────────────

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
        {**job, "progress": store.get_progress(job["id"])}
        for job in store.list_jobs()
    ]


@app.post("/api/jobs")
def create_job(body: CreateJobRequest):
    if body.network not in ("viettel", "vnpt"):
        raise HTTPException(400, "network must be 'viettel' or 'vnpt'")
    seed = body.pattern if body.network == "viettel" else "all"
    job_id = store.create_job(body.network, seed)
    _start(job_id, body.network)
    return {"job_id": job_id}


@app.post("/api/jobs/{job_id}/pause")
def pause_job(job_id: str):
    _pause(job_id)
    return {"status": "pausing"}


@app.post("/api/jobs/{job_id}/resume")
def resume_job(job_id: str):
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    _start(job_id, job["network"])
    return {"status": "resuming"}


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
        df = pd.read_csv(body.file, nrows=10_000, header=None, dtype=str)
        df.columns = ["number"]
        for name in body.presets:
            if name in PRESETS:
                df = df[df["number"].apply(PRESETS[name])]
        total = sum(1 for _ in open(body.file, "rb"))
        return {
            "numbers": df["number"].head(body.limit).tolist(),
            "filtered_count": len(df),
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
