# Sim Crawler Dashboard

Công cụ tự động thu thập số điện thoại sim số đẹp từ Viettel và VNPT, kết hợp dashboard quản lý job và bộ lọc số đẹp.

---

## Cài đặt

```bash
pip install -r requirements.txt
```

---

## Khởi động

### React + FastAPI (UI chính)

**Terminal 1 — Backend:**
```bash
python app.py
# hoặc: uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Frontend dev server:**
```bash
cd ui
npm install
npm run dev
```

Mở trình duyệt tại `http://localhost:5173`.

> **Production (1 server duy nhất):**
> ```bash
> cd ui && npm run build   # build React vào ui/dist/
> python app.py            # FastAPI tự serve ui/dist/ tại http://localhost:8000
> ```

### Streamlit (legacy, vẫn dùng được)

```bash
streamlit run dashboard.py
```

Mở trình duyệt tại `http://localhost:8501`.

---

## Cấu trúc dữ liệu đầu ra

| Đường dẫn | Nội dung |
|---|---|
| `data/{network}_{job_id}.csv` | Số điện thoại crawl được, 1 số/dòng |
| `logs/{job_id}.log` | Log tiến trình của từng job |
| `jobs.db` | SQLite lưu trạng thái toàn bộ job và queue |

---

## Hướng dẫn sử dụng

### 1. Cấu hình Proxy (sidebar trái)

Nếu IP bị chặn, điền thông tin proxy trước khi crawl:

```
DNS (ip:port) : 43.153.237.55:2334
Username      : your_username
Password      : your_password
```

Nhấn **💾 Lưu**. Proxy được đọc mỗi lần gửi request, không cần khởi động lại crawler.

> Bỏ trống DNS nếu không dùng proxy.

---

### 2. Tạo Job crawl mới

**Viettel:**

1. Chọn nhà mạng: `viettel`
2. Nhập pattern, dùng `?` làm wildcard:
   - `09????????` — toàn bộ đầu số 09x
   - `0901??????` — chỉ 0901xx xxxx
   - `090188????` — chỉ 090188 xxxx
3. Nhấn **🚀 Bắt đầu**

**VNPT:**

1. Chọn nhà mạng: `vnpt`
2. Pattern bỏ qua — VNPT tự động crawl toàn bộ 5 prefix: `082, 085, 088, 091, 094`
3. Nhấn **🚀 Bắt đầu**

> Có thể tạo nhiều job song song với các pattern khác nhau.

---

### 3. Quản lý Job đang chạy

Mỗi job hiển thị dưới dạng một expander trong phần **📋 Jobs**:

```
🟢 `a1b2c3d4` — VIETTEL `09????????` — 12,450 số — 34.2%
```

| Nút | Tác dụng |
|---|---|
| **⏸ Pause** | Dừng graceful sau pattern hiện tại, queue giữ nguyên trong DB |
| **▶ Resume** | Tiếp tục từ đúng chỗ đang dở |
| **🔁 Retry** | Reset các pattern bị lỗi về `pending` để crawl lại |
| **🗑 Xóa** | Dừng và xóa toàn bộ job (không xóa file CSV đã xuất) |

**Progress bar** hiển thị:
- `done` — số pattern đã xử lý xong
- `pending` — pattern còn trong queue
- `failed` — pattern bị lỗi (có thể retry)

**Log tail** hiển thị 40 dòng cuối của `logs/{job_id}.log` ngay trong expander.

---

### 4. Resume sau khi tắt chương trình

Khi restart `dashboard.py`, các job đang chạy dở được tự động phát hiện và chuyển sang trạng thái `🟡 PAUSED`. Nhấn **▶ Resume** để tiếp tục — không mất dữ liệu.

---

### 5. Lọc số đẹp (Data Explorer)

Mở expander **📊 Data Explorer** ở phần main:

1. Chọn file CSV từ danh sách
2. Chọn một hoặc nhiều bộ lọc:

| Preset | Ví dụ |
|---|---|
| Tứ quý (xxxx) | 0901**1111**23 |
| Ngũ quý (xxxxx) | 090**99999** |
| Taxi (abcabc) | 090**123123** |
| Lặp đôi (aabbcc) | 090**112233** |
| Sảnh xyzxyz | 090**234234** |
| Sảnh xyztxyzt | 09**12341234** |
| Tiến đều (4 số cuối) | 09012**3456** |
| Sảnh tiến (≥4 số) | 090**1234**56 |
| Toàn số chẵn | **0802468024** |

3. Preview hiển thị tối đa 5.000 dòng
4. Nhấn **📤 Xuất toàn bộ file** để lọc toàn bộ CSV (xử lý theo chunk, không giới hạn kích thước) — kết quả lưu vào `{tên_file}_filtered.csv`

---

### 6. Lọc hàng loạt bằng script (không qua UI)

Sửa đường dẫn trong `filter.py` rồi chạy:

```bash
python filter.py
```

Output ghi vào `{input_file}_filtered.csv` với tất cả các cột filter.

---

### 7. Xem log realtime từ terminal

```bash
# Thay {job_id} bằng ID thực, ví dụ: a1b2c3d4
tail -f logs/a1b2c3d4.log
```

---

## Thêm nhà mạng mới

1. Tạo `crawlers/{ten_mang}.py` kế thừa `BaseCrawler`
2. Implement `fetch(pattern) -> list[str]`
3. Thêm vào `st.selectbox` và hàm `_make_crawler()` trong `dashboard.py`

Tham khảo `crawlers/viettel.py` (dùng wildcard `?`) hoặc `crawlers/vnpt.py` (dùng prefix riêng).

---

## Trạng thái Job

```
PENDING → RUNNING → COMPLETED
                  ↘ PAUSED   → RUNNING  (resume)
                  ↘ FAILED   → PAUSED   (sau retry)
```

---

## Lưu ý

- `jobs.db`, `data/`, `logs/` đã được gitignore — không commit dữ liệu crawl lên git.
- Không xóa `jobs.db` khi đang có job chạy.
- XSRF token trong Viettel crawler có thể hết hạn — cập nhật lại trong `crawlers/viettel.py` nếu gặp lỗi 401/403.
