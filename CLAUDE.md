# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Run the dashboard
```bash
streamlit run dashboard.py
```

### Install dependencies
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
dashboard.py       — Streamlit UI (the only active frontend)
filter.py          — standalone batch filter script, imports from core/filters.py
```

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

`jobs.db` is the source of truth. On `dashboard.py` startup, any job with `status=RUNNING` but no active thread (crashed process) is automatically set to `PAUSED`. The user can then resume it without data loss.

### Adding a new carrier

1. Create `crawlers/{carrier}.py` extending `BaseCrawler`
2. Implement `fetch(pattern) -> list[str]` (raise on error; BaseCrawler handles retry/skip)
3. If the carrier API doesn't use `?` wildcards, override `run()` and `_process()` like `VNPTCrawler`
4. Add the new network option to the `st.selectbox` in `dashboard.py` and the `_make_crawler()` helper

### Filter presets

All filter functions live in `core/filters.py`. Both `dashboard.py` (interactive) and `filter.py` (batch) import from there. Never duplicate filter logic.
