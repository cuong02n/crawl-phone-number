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
uvicorn app:app --host 0.0.0.0 --port 9000 --reload
```
API available at `http://localhost:9000`

### Run frontend (React dev server)
```bash
cd ui
npm install
npm run dev
```
UI available at `http://localhost:8999` (proxies /api → port 9000)

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
job_id = store.create_job("viettel", "09????????", meta={"x_csrf_token": "...", "cookie": "D1N=...; laravel_session=..."})
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
  vite.config.js   — Vite config (port 8999, proxies /api → localhost:9000)
core/
  config.py        — load/save config.json, build proxy dict
  filters.py       — ALL filter preset functions + PRESETS dict (single source of truth)
  job_store.py     — SQLite state: jobs table + queue table
  base_crawler.py  — abstract BaseCrawler with iterative queue-based crawl loop
crawlers/
  viettel.py       — ViettelCrawler: uses requests.Session(), handles Set-Cookie automatically
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
| POST | `/api/jobs` | Create + start a new job (see Job creation below) |
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

### Job creation

`POST /api/jobs` body:
```json
{
  "network": "viettel",
  "pattern": "09????????",
  "x_csrf_token": "HL2g2Ck0...",
  "cookie": "D1N=...; laravel_session=..."
}
```

**Validation rules:**
- `proxy_dns` must be configured in `config.json` (Settings page) — blocks all networks
- `x_csrf_token` and `cookie` are required for Viettel jobs

`x_csrf_token` and `cookie` are stored in the `meta` JSON column of the `jobs` table so they survive pause/resume.

### Viettel authentication

Vietteltelecom.vn requires two things per request:
- Header `x-csrf-token`: a short alphanumeric token from the browser session
- Cookies: `D1N` (anti-bot challenge) and `laravel_session`

These are obtained from browser DevTools (Network tab → Copy as cURL). They expire with the browser session.

`ViettelCrawler` uses `requests.Session()` initialized with these values. The session automatically handles `Set-Cookie` headers from responses, keeping cookies fresh throughout the job.

**UI input modes** (Jobs page → Tạo Job mới → Viettel):
- **Từng field**: paste x-csrf-token, D1N, laravel_session individually
- **Paste Cookie**: paste x-csrf-token + full cookie string (auto-extracts D1N and laravel_session)
- **Paste cURL**: paste the full cURL command from DevTools (auto-extracts all 3 values, handles Windows CMD `^` escaping)

### Crawl algorithm

Both crawlers use an **iterative queue** (not recursion) backed by SQLite:

1. `create_job()` seeds the first pattern into the `queue` table
2. `BaseCrawler.run()` loops: pop a `pending` pattern → `fetch()` → if results < THRESHOLD save to CSV, else replace the first `?` with 0–9 and enqueue 10 children
3. On `pause()` the stop event fires and the crawler exits after the current pattern finishes; the queue remains in DB
4. On resume, a new thread calls `run()` again — it picks up from `pending` rows

**Viettel** uses `?` wildcards (e.g. `09????????`); expands left to right one digit at a time.
**VNPT** encodes patterns as `{prefix}:{search}` (e.g. `82:`, `82:123`) and starts with 5 prefix roots. `run()` is overridden to seed these roots on the first run.

### Queue row states

| Status | Meaning |
|--------|---------|
| `pending` | Waiting to be processed |
| `processing` | Currently being fetched (in-flight) |
| `done` | Finished — either saved as leaf or expanded into children |
| `failed` | fetch() raised an exception |

`processing` rows can only get stuck if the process is killed mid-fetch (not on graceful pause). `requeue_failed()` resets `failed` → `pending` for retry.

### Progress tracking

`get_progress(job_id)` returns:
```json
{
  "done": 1234,
  "pending": 3200,
  "failed": 5,
  "total": 4439,
  "percent": 27.8,
  "current_pattern": "09001?????"
}
```

`current_pattern` is the row currently in `processing` state — shown live in the job card UI.

### Job lifecycle

```
PENDING → RUNNING → COMPLETED
                  ↘ PAUSED → RUNNING  (resume)
                           → FAILED   (all patterns exhausted with errors)
```

### State persistence

`jobs.db` is the source of truth. On startup (`app.py` and `dashboard.py`), any job with `status=RUNNING` but no active thread (crashed process) is automatically set to `PAUSED`. The user can then resume it without data loss.

### DB schema notes

- `jobs.meta` — JSON blob, currently stores `x_csrf_token` and `cookie` for Viettel jobs
- Migration is automatic: `_init_schema()` runs `ALTER TABLE jobs ADD COLUMN meta` if the column is missing (safe for existing `jobs.db`)

### Adding a new carrier

1. Create `crawlers/{carrier}.py` extending `BaseCrawler`
2. Implement `fetch(pattern) -> list[str]` (raise on error; BaseCrawler handles retry/skip)
3. If the carrier API doesn't use `?` wildcards, override `run()` and `_process()` like `VNPTCrawler`
4. Add the network to `_make_crawler()` in `app.py`
5. Add to the network options in `ui/src/pages/Jobs.jsx`
6. Add any auth fields needed to `CreateJobRequest` in `app.py` and the create form in `Jobs.jsx`

### Filter presets

All filter functions live in `core/filters.py`. `dashboard.py` (Streamlit), `app.py` (API `/api/data/preview`), and `filter.py` (batch) all import from there. Never duplicate filter logic.