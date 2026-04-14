import streamlit as st
import json
import os
import subprocess
import sys
import pandas as pd
import glob

# --- CÁC HÀM LOGIC FILTER (PRESETS) ---
def is_all_even(number):
    return all(int(d) % 2 == 0 for d in str(number))

def is_last4_increasing(number):
    number = str(number)
    if len(number) < 4: return False
    last4 = [int(d) for d in number[-4:]]
    return last4[1] == last4[0] + 1 and last4[2] == last4[1] + 1 and last4[3] == last4[2] + 1

def is_lap_doi(number):
    number = str(number)[-6:]
    if len(number) < 6: return False
    return (number[0] == number[1] and number[2] == number[3] and number[4] == number[5])

def is_taxi(number):
    number = str(number)[-6:]
    if len(number) < 6: return False
    return number[:3] == number[3:] or (number[0] == number[2] == number[4] and number[1] == number[3] == number[5])

def has_tu_quy(number):
    number = str(number)
    for i in range(len(number) - 3):
        if number[i] == number[i + 1] == number[i + 2] == number[i + 3]:
            return True
    return False

def has_ngu_quy(number):
    number = str(number)
    for i in range(len(number) - 4):
        if number[i] == number[i + 1] == number[i + 2] == number[i + 3] == number[i + 4]:
            return True
    return False

def has_sanh_tien(number):
    number = str(number)
    count = 1
    for i in range(len(number) - 1):
        if int(number[i+1]) == int(number[i]) + 1:
            count += 1
            if count >= 4: return True
        else:
            count = 1
    return False

PRESETS = {
    "Tứ quý (xxxx)": has_tu_quy,
    "Ngũ quý (xxxxx)": has_ngu_quy,
    "Taxi (abcabc)": is_taxi,
    "Lặp đôi (aabbcc)": is_lap_doi,
    "Tiến đều (4 số cuối)": is_last4_increasing,
    "Toàn số chẵn": is_all_even,
    "Sảnh tiến (>=4 số)": has_sanh_tien
}

# --- GIAO DIỆN STREAMLIT ---
st.set_page_config(page_title="Sim Crawler Dashboard", layout="wide", page_icon="📱")

st.title("📱 Sim Crawler Dashboard")
st.markdown("Dashboard quản lý và lọc Sim số đẹp 100% bằng Python.")

CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'config.json')

def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'r') as f:
            return json.load(f)
    return {"proxy_dns": "", "username": "", "password": ""}

def save_config(config_data):
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config_data, f, indent=2)

col_side, col_main = st.columns([1, 4])

with col_side:
    st.header("⚙️ Configuration")
    current_config = load_config()
    with st.form("config_form"):
        proxy_dns = st.text_input("DNS Proxy address mapping", value=current_config.get("proxy_dns", ""))
        username = st.text_input("Username", value=current_config.get("username", ""))
        password = st.text_input("Password", type="password", value=current_config.get("password", ""))
        if st.form_submit_button("Lưu Cấu Hình", type="primary"):
            save_config({"proxy_dns": proxy_dns.strip(), "username": username.strip(), "password": password.strip()})
            st.success("✅ Đã lưu cấu hình!")

    st.markdown("---")
    st.header("🚀 Crawler Controls")
    
    viettel_pattern = st.text_input("Pattern Viettel (VD: 09????????)", value="09????????")
    
    JOBS_FILE = os.path.join(os.path.dirname(__file__), "jobs.json")
    
    def load_jobs():
        if os.path.exists(JOBS_FILE):
            with open(JOBS_FILE, 'r') as f:
                return json.load(f)
        return {"viettel": None, "vnpt": None}

    def save_jobs(jobs):
        with open(JOBS_FILE, 'w') as f:
            json.dump(jobs, f)

    def is_job_running(network):
        jobs = load_jobs()
        pid = jobs.get(network)
        if pid:
            try:
                import psutil
                process = psutil.Process(pid)
                return process.is_running() and process.status() != psutil.STATUS_ZOMBIE
            except:
                return False
        return False

    def stop_crawler(network):
        jobs = load_jobs()
        pid = jobs.get(network)
        if pid:
            try:
                import psutil
                process = psutil.Process(pid)
                for child in process.children(recursive=True):
                    child.kill()
                process.kill()
                st.toast(f"🛑 Đã dừng cào {network.upper()}")
            except:
                st.toast(f"⚠️ Không tìm thấy tiến trình {network}")
        jobs[network] = None
        save_jobs(jobs)

    def start_crawler(network, pattern=None):
        if is_job_running(network):
            st.error(f"Tiến trình {network} đang chạy rồi!")
            return
            
        base_dir = os.path.dirname(__file__)
        if network == "vnpt":
            path = os.path.join(base_dir, "vnpt", "crawl_vnpt.py")
            proc = subprocess.Popen([sys.executable, path], cwd=os.path.dirname(path))
            st.toast("✅ Đã khởi chạy cào VNPT")
        elif network == "viettel":
            path = os.path.join(base_dir, "viettel", "crawl_viettel.py")
            proc = subprocess.Popen([sys.executable, path, "--pattern", pattern], cwd=os.path.dirname(path))
            st.toast(f"✅ Đã khởi chạy cào Viettel pattern: {pattern}")
        
        jobs = load_jobs()
        jobs[network] = proc.pid
        save_jobs(jobs)

    # --- UI Cho Viettel ---
    st.subheader("Viettel")
    if is_job_running("viettel"):
        st.success("🟢 Đang chạy...")
        if st.button("Stop Viettel", type="primary", width="stretch"):
            stop_crawler("viettel")
            st.rerun()
    else:
        if st.button("Start Viettel", width="stretch"):
            start_crawler("viettel", pattern=viettel_pattern)
            st.rerun()

    # --- UI Cho VNPT ---
    st.subheader("VNPT")
    if is_job_running("vnpt"):
        st.success("🟢 Đang chạy...")
        if st.button("Stop VNPT", type="primary", width="stretch"):
            stop_crawler("vnpt")
            st.rerun()
    else:
        if st.button("Start VNPT", width="stretch"):
            start_crawler("vnpt")
            st.rerun()

with col_main:
    # 📊 PHẦN 1: DATA EXPLORER & FILTERS (THU GỌN)
    with st.expander("📊 Data Explorer & Filters", expanded=True):
        csv_files = glob.glob("**/*.csv", recursive=True)
        if not csv_files:
            st.warning("Chưa tìm thấy file dữ liệu CSV nào.")
        else:
            file_col, filter_col = st.columns([1, 1])
            with file_col:
                selected_file = st.selectbox("📁 Chọn file dữ liệu:", csv_files)
            with filter_col:
                selected_presets = st.multiselect("🎯 Chọn bộ lọc (Presets):", list(PRESETS.keys()))

            if selected_file:
                try:
                    df_preview = pd.read_csv(selected_file, nrows=5000, header=None if "result" in selected_file else 'infer')
                    if df_preview.shape[1] == 1: df_preview.columns = ["number"]
                    if selected_presets:
                        for preset in selected_presets:
                            df_preview = df_preview[df_preview["number"].astype(str).apply(PRESETS[preset])]
                    
                    row_count = sum(1 for line in open(selected_file, 'rb'))
                    st.write(f"📊 Hiển thị **{len(df_preview)}** kết quả | 📈 Tổng: **{row_count:,}**")
                    st.dataframe(df_preview, width="stretch", height=200, column_config={"number": st.column_config.TextColumn("Số điện thoại", width="medium")})
                    
                    if st.button("🪄 Xuất toàn bộ file", type="secondary"):
                        with st.spinner("Đang xử lý..."):
                            output_path = selected_file.replace(".csv", "_filtered_ui.csv")
                            first_chunk = True
                            count_filtered = 0
                            for chunk in pd.read_csv(selected_file, chunksize=50000, header=None if "result" in selected_file else 'infer'):
                                if chunk.shape[1] == 1: chunk.columns = ["number"]
                                for preset in selected_presets:
                                    chunk = chunk[chunk["number"].astype(str).apply(PRESETS[preset])]
                                if not chunk.empty:
                                    chunk.to_csv(output_path, mode='a', index=False, header=first_chunk)
                                    first_chunk = False
                                    count_filtered += len(chunk)
                            st.success(f"✅ Đã lưu: `{output_path}` ({count_filtered} số).")
                except Exception as e:
                    st.error(f"Lỗi: {e}")

    # 📜 PHẦN 2: CRAWLER LOGS (REAL-TIME)
    st.markdown("---")
    st.header("📜 Crawler Logs (Real-time)")
    
    log_auto_refresh = st.toggle("Tự động làm mới (3 giây)", value=True)
    
    col_log1, col_log2 = st.columns(2)
    
    log_files = ["viettel/error_viettel.log", "vnpt/error.log"]
    
    def get_log_content(file_path):
        if not os.path.exists(file_path):
             return "Chưa có dữ liệu log..."
        try:
            # Sử dụng cách đọc file chia sẻ (shared access) để tránh bị chặn trên Windows
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
                return "".join(lines[-100:])
        except PermissionError:
            # Nếu file bị lock bởi tiến trình khác, thử lại bằng cách đọc binary
            try:
                with open(file_path, "rb") as f:
                    f.seek(0, os.SEEK_END)
                    size = f.tell()
                    f.seek(max(0, size - 10000)) # Đọc khoảng 10KB cuối
                    return f.read().decode("utf-8", errors="ignore")
            except:
                return "Phần mềm đang ghi log, vui lòng đợi..."
        except Exception as e:
            return f"Lỗi đọc log: {str(e)}"

    col_log1.subheader("Viettel Logs")
    col_log1.code(get_log_content(log_files[0]), language="txt")
    
    col_log2.subheader("VNPT Logs")
    col_log2.code(get_log_content(log_files[1]), language="txt")

    if log_auto_refresh:
        import time
        time.sleep(3)
        st.rerun()
    else:
        if st.button("🔄 Làm mới Log"):
            st.rerun()

st.markdown("---")
st.info("💡 Mẹo: Phần Data Explorer đã được thu gọn phía trên để bạn tập trung nhìn Logs của các Job đang chạy.")
