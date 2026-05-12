import glob
import os
import sys
import threading
import time

import pandas as pd
import streamlit as st

sys.path.insert(0, os.path.dirname(__file__))

from core.config import load_config, save_config
from core.filters import PRESETS
from core.job_store import JobStatus, JobStore
from crawlers.viettel import ViettelCrawler
from crawlers.vnpt import VNPTCrawler

# ── Module-level state (survives Streamlit reruns) ─────────────────────────────
store = JobStore()
_crawlers: dict[str, ViettelCrawler | VNPTCrawler] = {}

# On startup, fix any jobs left in RUNNING state from a crashed process
for _job in store.list_jobs():
    if _job["status"] == JobStatus.RUNNING and _job["id"] not in _crawlers:
        store.set_status(_job["id"], JobStatus.PAUSED)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_crawler(job_id: str, network: str):
    return ViettelCrawler(job_id, store) if network == "viettel" else VNPTCrawler(job_id, store)


def start_job(job_id: str, network: str):
    crawler = _make_crawler(job_id, network)
    _crawlers[job_id] = crawler
    threading.Thread(target=crawler.run, daemon=True).start()


def pause_job(job_id: str):
    crawler = _crawlers.get(job_id)
    if crawler:
        crawler.pause()


def read_log_tail(job_id: str, n: int = 60) -> str:
    log_file = store.get_log_file(job_id)
    if not log_file or not os.path.exists(log_file):
        return "Chưa có log..."
    try:
        with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
        return "".join(lines[-n:]) or "Log trống."
    except Exception as e:
        return f"Lỗi đọc log: {e}"


STATUS_ICON = {
    JobStatus.RUNNING:   "🟢",
    JobStatus.PAUSED:    "🟡",
    JobStatus.COMPLETED: "✅",
    JobStatus.FAILED:    "🔴",
    JobStatus.PENDING:   "⚪",
}

# ── Page config ────────────────────────────────────────────────────────────────
st.set_page_config(page_title="Sim Crawler", layout="wide", page_icon="📱")
st.title("📱 Sim Crawler Dashboard")

col_side, col_main = st.columns([1, 3])

# ══════════════════════════════════════════════════════════════════════════════
# SIDEBAR
# ══════════════════════════════════════════════════════════════════════════════
with col_side:
    # ── Proxy config ────────────────────────────────────────────────────────
    st.header("⚙️ Proxy")
    cfg = load_config()
    with st.form("config_form"):
        proxy_dns = st.text_input("DNS (ip:port)", value=cfg.get("proxy_dns", ""))
        username  = st.text_input("Username",      value=cfg.get("username",  ""))
        password  = st.text_input("Password", type="password", value=cfg.get("password", ""))
        if st.form_submit_button("💾 Lưu", type="primary"):
            save_config({
                "proxy_dns": proxy_dns.strip(),
                "username":  username.strip(),
                "password":  password.strip(),
            })
            st.success("Đã lưu!")

    st.divider()

    # ── New job ──────────────────────────────────────────────────────────────
    st.header("➕ Job mới")
    with st.form("new_job_form"):
        network = st.selectbox("Nhà mạng", ["viettel", "vnpt"])
        pattern = st.text_input(
            "Pattern (Viettel)",
            value="09????????",
            help="Ký tự ? là wildcard. Chỉ áp dụng cho Viettel; VNPT tự seed tất cả prefix.",
        )
        if st.form_submit_button("🚀 Bắt đầu", type="primary"):
            seed = pattern if network == "viettel" else "all"
            job_id = store.create_job(network, seed)
            start_job(job_id, network)
            st.success(f"Job `{job_id}` đã tạo!")
            st.rerun()

    st.divider()

    # ── Quick stats ──────────────────────────────────────────────────────────
    jobs = store.list_jobs()
    running  = sum(1 for j in jobs if j["status"] == JobStatus.RUNNING)
    paused   = sum(1 for j in jobs if j["status"] == JobStatus.PAUSED)
    done     = sum(1 for j in jobs if j["status"] == JobStatus.COMPLETED)
    st.metric("Đang chạy",  running)
    st.metric("Đang dừng",  paused)
    st.metric("Hoàn thành", done)

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════
with col_main:

    # ── Job list ─────────────────────────────────────────────────────────────
    st.header("📋 Jobs")

    jobs = store.list_jobs()

    if not jobs:
        st.info("Chưa có job nào. Tạo job mới ở sidebar.")
    else:
        for job in jobs:
            jid     = job["id"]
            status  = job["status"]
            network = job["network"]
            pattern = job["pattern"]
            saved   = job["total_saved"]
            prog    = store.get_progress(jid)
            icon    = STATUS_ICON.get(status, "⚪")

            label = (
                f"{icon} `{jid}` — **{network.upper()}** `{pattern}` "
                f"— {saved:,} số — {prog['percent']}%"
            )
            expanded = status == JobStatus.RUNNING

            with st.expander(label, expanded=expanded):
                # Progress bar
                st.progress(
                    prog["percent"] / 100,
                    text=(
                        f"{prog['done']} done  |  "
                        f"{prog['pending']} pending  |  "
                        f"{prog['failed']} failed"
                    ),
                )

                btn_col, info_col = st.columns([2, 3])

                with btn_col:
                    b1, b2, b3 = st.columns(3)

                    if status == JobStatus.RUNNING:
                        if b1.button("⏸ Pause",  key=f"pause_{jid}"):
                            pause_job(jid)
                            st.rerun()
                    elif status in (JobStatus.PAUSED, JobStatus.PENDING):
                        if b1.button("▶ Resume", key=f"resume_{jid}"):
                            start_job(jid, network)
                            st.rerun()

                    if status == JobStatus.FAILED or prog["failed"] > 0:
                        if b2.button("🔁 Retry", key=f"retry_{jid}",
                                     help="Đẩy lại các pattern failed"):
                            store.requeue_failed(jid)
                            store.set_status(jid, JobStatus.PAUSED)
                            st.rerun()

                    if b3.button("🗑", key=f"del_{jid}", help="Xóa job"):
                        pause_job(jid)
                        store.delete_job(jid)
                        st.rerun()

                with info_col:
                    st.caption(
                        f"Output: `{os.path.basename(store.get_output_file(jid))}`  "
                        f"| Created: {job['created_at'][:19]}"
                    )

                # Log tail
                with st.container():
                    st.code(read_log_tail(jid, 40), language="log")

        col_refresh, col_auto = st.columns([1, 2])
        with col_refresh:
            if st.button("🔄 Refresh"):
                st.rerun()
        with col_auto:
            auto = st.toggle("Auto-refresh (2s)", value=any(
                j["status"] == JobStatus.RUNNING for j in jobs
            ))

        if auto:
            time.sleep(2)
            st.rerun()

    st.divider()

    # ── Data Explorer ─────────────────────────────────────────────────────────
    with st.expander("📊 Data Explorer", expanded=False):
        data_dir = os.path.join(os.path.dirname(__file__), "data")
        csv_files = sorted(
            glob.glob(os.path.join(data_dir, "*.csv"))
            + glob.glob(os.path.join(os.path.dirname(__file__), "**", "*.csv"),
                        recursive=True)
        )
        csv_files = list(dict.fromkeys(csv_files))  # deduplicate, preserve order

        if not csv_files:
            st.warning("Chưa có file CSV. Hãy chạy crawler trước.")
        else:
            fc, pc = st.columns(2)
            with fc:
                selected = st.selectbox("📁 File:", csv_files,
                                        format_func=os.path.basename)
            with pc:
                selected_presets = st.multiselect("🎯 Filter:", list(PRESETS.keys()))

            if selected:
                try:
                    df = pd.read_csv(selected, nrows=5000, header=None, dtype=str)
                    df.columns = ["number"]

                    for preset_name in selected_presets:
                        df = df[df["number"].apply(PRESETS[preset_name])]

                    total_rows = sum(1 for _ in open(selected, "rb"))
                    st.caption(
                        f"Hiển thị **{len(df):,}** kết quả  |  "
                        f"Tổng file: **{total_rows:,}** dòng"
                    )
                    st.dataframe(
                        df,
                        height=300,
                        column_config={"number": st.column_config.TextColumn("Số điện thoại")},
                        use_container_width=True,
                    )

                    if selected_presets and st.button("📤 Xuất toàn bộ file"):
                        out_path = selected.replace(".csv", "_filtered.csv")
                        first_chunk = True
                        count = 0
                        with st.spinner("Đang xử lý..."):
                            for chunk in pd.read_csv(
                                selected, chunksize=50_000, header=None, dtype=str
                            ):
                                chunk.columns = ["number"]
                                for preset_name in selected_presets:
                                    chunk = chunk[chunk["number"].apply(PRESETS[preset_name])]
                                if not chunk.empty:
                                    chunk.to_csv(out_path, mode="a", index=False,
                                                 header=first_chunk)
                                    first_chunk = False
                                    count += len(chunk)
                        st.success(f"✅ Đã lưu {count:,} số → `{out_path}`")

                except Exception as e:
                    st.error(f"Lỗi: {e}")
