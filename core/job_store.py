import json
import os
import sqlite3
import uuid
from datetime import datetime
from enum import Enum

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
DB_PATH = os.path.join(ROOT_DIR, "jobs.db")
DATA_DIR = os.path.join(ROOT_DIR, "data")
LOG_DIR = os.path.join(ROOT_DIR, "logs")


class JobStatus(str, Enum):
    PENDING   = "pending"
    RUNNING   = "running"
    PAUSED    = "paused"
    COMPLETED = "completed"
    FAILED    = "failed"


class JobStore:
    def __init__(self, db_path: str = DB_PATH):
        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(LOG_DIR, exist_ok=True)
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self):
        # migrate: add meta column if missing
        cols = [r[1] for r in self.conn.execute("PRAGMA table_info(jobs)").fetchall()]
        if "meta" not in cols:
            self.conn.execute("ALTER TABLE jobs ADD COLUMN meta TEXT DEFAULT '{}'")
            self.conn.commit()

        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS jobs (
                id          TEXT PRIMARY KEY,
                network     TEXT NOT NULL,
                pattern     TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'pending',
                total_saved INTEGER DEFAULT 0,
                output_file TEXT,
                log_file    TEXT,
                created_at  TEXT,
                updated_at  TEXT,
                meta        TEXT DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS queue (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id  TEXT NOT NULL REFERENCES jobs(id),
                pattern TEXT NOT NULL,
                status  TEXT NOT NULL DEFAULT 'pending'
            );

            CREATE INDEX IF NOT EXISTS idx_queue_lookup
                ON queue(job_id, status);
        """)
        self.conn.commit()

    # ── Job lifecycle ──────────────────────────────────────────────────────────

    def create_job(self, network: str, pattern: str, meta: dict | None = None) -> str:
        job_id = str(uuid.uuid4())[:8]
        now = datetime.now().isoformat()
        output_file = os.path.join(DATA_DIR, f"{network}_{job_id}.csv")
        log_file = os.path.join(LOG_DIR, f"{job_id}.log")

        self.conn.execute(
            "INSERT INTO jobs VALUES (?,?,?,?,0,?,?,?,?,?)",
            (job_id, network, pattern, JobStatus.PENDING,
             output_file, log_file, now, now, json.dumps(meta or {})),
        )
        # Seed the first pattern into the queue
        self.conn.execute(
            "INSERT INTO queue (job_id, pattern) VALUES (?,?)",
            (job_id, pattern),
        )
        self.conn.commit()
        return job_id

    def set_status(self, job_id: str, status: JobStatus):
        self.conn.execute(
            "UPDATE jobs SET status=?, updated_at=? WHERE id=?",
            (status, datetime.now().isoformat(), job_id),
        )
        self.conn.commit()

    def get_job(self, job_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM jobs WHERE id=?", (job_id,)
        ).fetchone()
        return dict(row) if row else None

    def list_jobs(self) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM jobs ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def delete_job(self, job_id: str):
        self.conn.execute("DELETE FROM queue WHERE job_id=?", (job_id,))
        self.conn.execute("DELETE FROM jobs WHERE id=?", (job_id,))
        self.conn.commit()

    # ── Queue operations ───────────────────────────────────────────────────────

    def pop_next(self, job_id: str) -> str | None:
        """Atomically fetch the next pending pattern and mark it processing."""
        row = self.conn.execute(
            "SELECT id, pattern FROM queue WHERE job_id=? AND status='pending' LIMIT 1",
            (job_id,),
        ).fetchone()
        if not row:
            return None
        self.conn.execute(
            "UPDATE queue SET status='processing' WHERE id=?", (row["id"],)
        )
        self.conn.commit()
        return row["pattern"]

    def enqueue(self, job_id: str, patterns: list[str]):
        self.conn.executemany(
            "INSERT INTO queue (job_id, pattern) VALUES (?,?)",
            [(job_id, p) for p in patterns],
        )
        self.conn.commit()

    def mark_done(self, job_id: str, pattern: str):
        self.conn.execute(
            "UPDATE queue SET status='done' WHERE job_id=? AND pattern=? AND status='processing'",
            (job_id, pattern),
        )
        self.conn.commit()

    def mark_failed(self, job_id: str, pattern: str):
        self.conn.execute(
            "UPDATE queue SET status='failed' WHERE job_id=? AND pattern=? AND status='processing'",
            (job_id, pattern),
        )
        self.conn.commit()

    def requeue_failed(self, job_id: str):
        """Reset all failed patterns back to pending so they can be retried."""
        self.conn.execute(
            "UPDATE queue SET status='pending' WHERE job_id=? AND status='failed'",
            (job_id,),
        )
        self.conn.commit()

    # ── Stats ──────────────────────────────────────────────────────────────────

    def increment_saved(self, job_id: str, count: int):
        self.conn.execute(
            "UPDATE jobs SET total_saved = total_saved + ? WHERE id=?",
            (count, job_id),
        )
        self.conn.commit()

    def get_progress(self, job_id: str) -> dict:
        row = self.conn.execute("""
            SELECT
                SUM(CASE WHEN status='done'       THEN 1 ELSE 0 END) AS done,
                SUM(CASE WHEN status='pending'
                       OR status='processing'     THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status='failed'     THEN 1 ELSE 0 END) AS failed
            FROM queue WHERE job_id=?
        """, (job_id,)).fetchone()
        done    = row["done"]    or 0
        pending = row["pending"] or 0
        failed  = row["failed"]  or 0
        total   = done + pending + failed

        cur = self.conn.execute(
            "SELECT pattern FROM queue WHERE job_id=? AND status='processing' LIMIT 1",
            (job_id,),
        ).fetchone()

        return {
            "done":            done,
            "pending":         pending,
            "failed":          failed,
            "total":           total,
            "percent":         round(done / total * 100, 1) if total > 0 else 0,
            "current_pattern": cur["pattern"] if cur else None,
        }

    def get_meta(self, job_id: str) -> dict:
        row = self.conn.execute(
            "SELECT meta FROM jobs WHERE id=?", (job_id,)
        ).fetchone()
        return json.loads(row["meta"] or "{}") if row else {}

    def get_output_file(self, job_id: str) -> str:
        row = self.conn.execute(
            "SELECT output_file FROM jobs WHERE id=?", (job_id,)
        ).fetchone()
        return row["output_file"] if row else ""

    def get_log_file(self, job_id: str) -> str:
        row = self.conn.execute(
            "SELECT log_file FROM jobs WHERE id=?", (job_id,)
        ).fetchone()
        return row["log_file"] if row else ""
