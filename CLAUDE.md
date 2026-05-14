# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Versions

- **V1** (archived): `archive/v1/` — standalone scripts (main_03/08/09, crawl_viettel, crawl_vnpt), no UI, no job tracking
- **V2** (current): FastAPI backend + React frontend + Streamlit fallback, full job lifecycle management

## Commands

### Run backend (FastAPI)
```bash
python app.py
# or
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```
API available at `http://localhost:9000`

### Run frontend (React dev server)
```bash
cd ui
npm install
npm run dev
```
UI available at `http://localhost:8999` (proxies API to port 9000)

### Build frontend for production
```bash
cd ui
npm run build
# Built files go to ui/dist/ — served automatically by FastAPI at http://localhost:9000
```

### Run Streamlit dashboard (alternative UI)
```bash
streamlit run dashboard.py
```

### Install Python dependencies
```bash
pip install -r requirements.txt
```

### Run a crawler manually (for testing)
```python
from core.job_store import JobStore
from crawlers.viettel import ViettelCrawler

store = JobStore()
job_id = store.create_job("viettel", "09????????")
ViettelCrawler(job_id, store).run()
```

## Architecture

### Directory layout
```
app.py             — FastAPI backend (main entry point for V2)
dashboard.py       — Streamlit UI (alternative frontend)
filter.py          — standalone batch filter script, imports from core/filters.py
ui/
  src/
    App.jsx        — root React app with routing
    api.js         — all fetch calls to FastAPI
    pages/
      Dashboard.jsx  — overview stats + live feed
      Jobs.jsx       — job list: create/pause/resume/retry/delete + log viewer
      Explorer.jsx   — browse CSV files, apply filters, download
      Settings.jsx   — proxy config
  vite.config.js   — Vite config (proxies /api → localhost:8000)
core/
  config.py        — load/save config.json, build proxy dict
  filters.py       — ALL filter preset functions + PRESETS dict (single source of truth)
  job_store.py     — SQLite state: jobs table + queue table
  base_crawler.py  — abstract BaseCrawler with iterative queue-based crawl loop
crawlers/
  viettel.py       — ViettelCrawler: only implements fetch()
  vnpt.py          — VNPTCrawler: overrides run()/_process() for prefix-based API
data/              — output CSVs, one per job: {network}_{job_id}.csv
logs/              — per-job log files: {job_id}.log
jobs.db            — SQLite database (runtime, gitignored)
archive/
  v1/              — legacy standalone scripts (do not use)
    viettel/       — main_03.py, main_08.py, main_09.py, crawl_viettel.py
    vnpt/          — crawl_vnpt.py
```

### API endpoints (app.py)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config` | Get proxy config |
| POST | `/api/config` | Save proxy config |
| GET | `/api/stats` | Aggregate stats (total jobs, running, saved) |
| GET | `/api/jobs` | List all jobs with progress |
| POST | `/api/jobs` | Create + start a new job `{network, pattern}` |
| POST | `/api/jobs/{id}/pause` | Pause a running job |
| POST | `/api/jobs/{id}/resume` | Resume a paused job |
| POST | `/api/jobs/{id}/retry` | Requeue failed patterns and restart |
| DELETE | `/api/jobs/{id}` | Pause and delete a job |
| GET | `/api/jobs/{id}/log` | Tail job log file |
| GET | `/api/jobs/{id}/failed-patterns` | List failed queue patterns |
| GET | `/api/feed/recent` | Last N numbers across all CSV files |
| GET | `/api/data/files` | List output CSV files |
| POST | `/api/data/preview` | Preview CSV with filter presets applied |
| GET | `/api/data/download` | Download a CSV file |

### Crawl algorithm

Both crawlers use an **iterative queue** (not recursion) backed by SQLite:

1. `create_job()` seeds the first pattern into the `queue` table
2. `BaseCrawler.run()` loops: pop a `pending` pattern → `fetch()` → if results < THRESHOLD save to CSV, else expand wildcards and enqueue children
3. On `pause()` the stop event fires and the crawler exits after the current pattern; the queue remains in DB
4. On resume, a new thread calls `run()` again — it picks up from `pending` rows

**Viettel** uses `?` wildcards (e.g. `09????????`); each `?` is expanded 0–9.
**VNPT** encodes patterns as `{prefix}:{search}` (e.g. `82:`, `82:123`) and starts with 5 prefix roots. `run()` is overridden to seed these roots on the first run.

### Job lifecycle

```
PENDING → RUNNING → COMPLETED
                  ↘ PAUSED → RUNNING  (resume)
                           → FAILED   (all patterns exhausted with errors)
```

`requeue_failed()` resets failed queue rows back to `pending` for retry.

### State persistence

`jobs.db` is the source of truth. On startup (`app.py` and `dashboard.py`), any job with `status=RUNNING` but no active thread (crashed process) is automatically set to `PAUSED`. The user can then resume it without data loss.

### Adding a new carrier

1. Create `crawlers/{carrier}.py` extending `BaseCrawler`
2. Implement `fetch(pattern) -> list[str]` (raise on error; BaseCrawler handles retry/skip)
3. If the carrier API doesn't use `?` wildcards, override `run()` and `_process()` like `VNPTCrawler`
4. Add the network to `_make_crawler()` in both `app.py` and `dashboard.py`
5. Add to the network options in `ui/src/pages/Jobs.jsx`

### Filter presets

All filter functions live in `core/filters.py`. `dashboard.py` (Streamlit), `app.py` (API `/api/data/preview`), and `filter.py` (batch) all import from there. Never duplicate filter logic.