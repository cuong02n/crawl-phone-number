# Dự án Crawl Phone Number

Dự án này là một công cụ giúp tự động hóa quá trình thu thập số điện thoại từ các nhà mạng (Viettel, VNPT) và lọc ra những số điện thoại đẹp (Sim số đẹp) như tứ quý, ngũ quý, lặp đôi, tiến đều, v.v...

## 📁 Cấu trúc thư mục

* **`vnpt/`**: Chứa logic thu thập số điện thoại mạng VNPT.
  * `crawl_vnpt.py`: Chạy đa luồng (multi-threading) để thu thập các đầu số điện thoại `82`, `85`, `88`, `91`, `94` của VNPT từ website `digishop.vnpt.vn`. Lưu vào thư mục `E:\sim_data/vnpt/`.
* **`viettel/`**: Chứa logic thu thập số điện thoại mạng Viettel.
  * `main_03.py`, `main_08.py`, `main_09.py`: Mỗi file tương ứng với một đầu số quét mạng ảo của hệ thống `apigami.viettel.vn`. Dữ liệu ghi ra file CSV tương ứng với từng prefix.
* **`filter.py`**: Trái tim lọc dữ liệu. Dùng thư viện `pandas` để load các CSV lớn (chứa kết quả cào được) rồi tạo thêm các cột đánh giá độ đẹp của số điện thoại (VD: `AllEven`, `Last4Increasing`, `Taxi`, `Tu_quy`, `Ngu_quy`,...). Kết quả xuất ra file `_filtered.csv`.
* Các file csv đi kèm (`tra_sau.csv`, `all.csv`...): Chứa bộ dữ liệu kết quả (database lưu trữ định dạng raw/phân cấp).

---

## 🐛 Phân tích Bug tiềm ẩn & Đề xuất phòng ngừa

Theo yêu cầu của bạn, dưới đây là những rủi ro lập trình có thể làm ứng dụng "chết ngang" hoặc không phản hồi trong quá trình vận hành lâu dài:

### 1. Lỗi Đệ Quy Vô Hạn (RecursionError) - [Rất Nguy Hiểm]
Trong cả `viettel/main_09.py` và `vnpt/crawl_vnpt.py`, hàm `query_server` sử dụng đệ quy để thử lại khi có exception:
```python
except Exception as e:
    logging.error(f"Unknown error: {e}, retry")
    return query_server(pattern)
```
Và trong `crawl_pattern` cũng có logic tương tự:
```python
if not response or response.get("errorCode") != 0:
    logging.error(f"Lỗi khi truy vấn pattern {pattern}: {response}, retry")
    crawl_pattern(pattern)
    return
```
👉 **Nguyên nhân lỗi:** Nếu mạng bị mất kết nối thực sự, proxy (43.153.237.55:2334) bị die, hoặc phía server nhà mạng chặn hoàn toàn (trả về code lỗi liên tục). Đệ quy sẽ loop không giới hạn và làm văng chương trình theo lỗi cấu trúc bộ nhớ `RecursionError: maximum recursion depth exceeded`.
👉 **Khắc phục:** Thay vì dùng đệ quy, hãy dùng vòng lặp `while True:` hoặc `for attempt in range(max_retries):`, kết hợp với `time.sleep()` trước mỗi lần thử lại. 

### 2. Lỗi Đường Dẫn Thư Mục (FileNotFoundError)
Ở file `filter.py` và `vnpt/crawl_vnpt.py`:
```python
OUTPUT_PREFIX = "E:\sim_data/vnpt/result_" # (Có dùng gạch nối ngược - xuôi lẫn lộn)
FILE = "E:/sim_data/vnpt/result_88.csv"
```
👉 **Nguyên nhân lỗi:** Python nếu dùng mode `open("...", "a")` mà các thư mục cha (ví dụ như thư mục con `vnpt` bên trong `E:/sim_data`) **chưa tồn tại**, thì code sẽ ném ra lỗi khởi tạo file và ngừng ngay lúc ghi.
👉 **Khắc phục:** Sử dụng thư viện `os` hoặc `pathlib` để tự tạo folder trước hoặc thay đổi linh hoạt theo config:
```python
import os
os.makedirs("E:/sim_data/vnpt", exist_ok=True)
```

### 3. Connection Timeout do Proxy & Tràn RAM nếu file quá lớn
- Cấu hình proxy đang bị code rập khuôn (hardcode) trong logic, nếu server đổi IP, bạn phải mất công sửa file.
- `filter.py` hiện tại đọc file vào RAM 100% bằng `.read_csv()` do cấu trúc Dataframe. Tuy nhiên, với một file >5GB toàn số điện thoại, nếu mở bằng `pd.read_csv`, máy của bạn có thể bị tràn bộ nhớ.
👉 **Khắc phục:** Thêm tham số `chunksize=...` vào thư viện pandas trong `filter.py` nếu dữ liệu thực tế lớn lên.

### 4. Thiếu file `requirements.txt`
Project đang dùng các thư viện mở rộng như `pandas`, `requests`, và `urllib3` nhưng chưa có index quản lý file cài đặt. Rất khó thiết lập trên máy cấu hình mới.
