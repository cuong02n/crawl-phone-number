# Luồng hoạt động Viettel Crawler — Tài liệu kỹ thuật chi tiết

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Bảo mật của Viettel — Những gì cần vượt qua](#2-bảo-mật-của-viettel)
3. [Giai đoạn 1 — Lấy Session (viettel_auth.py)](#3-giai-đoạn-1--lấy-session)
4. [Giai đoạn 2 — Tạo Job (app.py + job_store.py)](#4-giai-đoạn-2--tạo-job)
5. [Giai đoạn 3 — Khởi tạo Crawler (viettel.py)](#5-giai-đoạn-3--khởi-tạo-crawler)
6. [Giai đoạn 4 — Vòng lặp Crawl (base_crawler.py)](#6-giai-đoạn-4--vòng-lặp-crawl)
7. [Giai đoạn 5 — Mỗi lần fetch (viettel.py fetch)](#7-giai-đoạn-5--mỗi-lần-fetch)
8. [Giai đoạn 6 — Xử lý kết quả và mở rộng pattern](#8-giai-đoạn-6--xử-lý-kết-quả-và-mở-rộng-pattern)
9. [Pause / Resume / Retry](#9-pause--resume--retry)
10. [Tóm tắt toàn bộ luồng dưới dạng sơ đồ](#10-sơ-đồ-tổng-thể)

---

## 1. Tổng quan kiến trúc

```
UI (React)
  │  POST /api/viettel/auto-session   ← lấy credentials tự động
  │  POST /api/jobs                   ← tạo job và bắt đầu crawl
  │  WebSocket /ws                    ← nhận cập nhật realtime
  ▼
app.py (FastAPI)
  │
  ├─ core/viettel_auth.py     ← Playwright lấy session từ trình duyệt
  ├─ core/config.py           ← đọc proxy config từ config.json
  ├─ core/job_store.py        ← SQLite: jobs table + queue table
  └─ crawlers/viettel.py      ← logic crawl thực sự
       │ extends
       └─ core/base_crawler.py ← vòng lặp worker threads + queue management
```

Tất cả state được lưu trong **SQLite** (`jobs.db`), không phải RAM. Lý do: nếu server crash, restart lại vẫn biết job đang ở đâu, queue còn những pattern nào chưa xử lý.

---

## 2. Bảo mật của Viettel

Trước khi đọc code, cần hiểu Viettel có **3 lớp bảo vệ** khác nhau:

### Lớp 1 — D1N Cookie (Anti-bot, IP-bound)

**Cơ chế:** Lần đầu một IP lạ truy cập API `/api/get/sim`, server trả về HTTP 200 nhưng nội dung là HTML (không phải JSON), trong đó có đoạn JavaScript:

```javascript
document.cookie = "D1N=1505743d0d3b383bca84c32f602f0ac6; path=/";
location.reload();
```

**Ý nghĩa:** Server "cài" cookie D1N vào browser của user hợp lệ. Bot không biết phải đọc cookie từ HTML và tự set vào request tiếp theo.

**Quan trọng:** D1N bị trói vào **IP**, không phải session. Nghĩa là:
- IP-A có D1N-A hợp lệ → gửi request từ IP-B → bị challenge lại, phải lấy D1N-B mới

**Hệ quả thiết kế:** Tất cả requests của 1 job phải đi qua **cùng 1 IP** (sticky proxy). Nếu proxy xoay IP mỗi request, sẽ bị vòng lặp challenge vô tận.

### Lớp 2 — Laravel Session + CSRF Token

**Cơ chế:** Vietteltelecom.vn dùng Laravel (PHP framework). Mỗi browser session tạo ra:
- `laravel_session`: cookie xác định server-side session
- `x-csrf-token`: token ngắn (~40 ký tự) từ `<meta name="csrf-token">` trong HTML, dùng để xác thực mọi AJAX request

Nếu `x-csrf-token` sai hoặc `laravel_session` hết hạn → server trả HTTP **419 CSRF token mismatch**.

**Session tồn tại bao lâu:** Phụ thuộc cấu hình Laravel của Viettel, thực tế khoảng vài giờ. Không có cách renew tự động mà không vào browser lại.

### Lớp 3 — Rate Limiting (Sliding Window)

**Cơ chế:** Server đếm số request trong cửa sổ thời gian trượt 30 giây. Khi vượt ~20 request/30s → trả về:
```json
{"errorCode": 1, "message": "..."}
```

**Quan trọng:** `errorCode=1` KHÔNG có nghĩa là "không có số nào". Nó là tín hiệu rate limit, cần phải ngủ 60s rồi thử lại. Trước đây code cũ sai, raise exception và đánh dấu pattern là `failed` → mất dữ liệu.

---

## 3. Giai đoạn 1 — Lấy Session

**File:** `core/viettel_auth.py`

**Mục tiêu:** Lấy được `x_csrf_token`, `D1N`, `laravel_session` mà không cần user mở DevTools thủ công.

### Tại sao dùng Playwright (không dùng requests trực tiếp)?

Để có `laravel_session` và `x_csrf_token` hợp lệ, cần browser thật thực hiện đầy đủ quy trình:
1. Load trang HTML từ server
2. Server set cookie `laravel_session`
3. HTML chứa `<meta name="csrf-token" content="...">` với token mới
4. JS trên trang chạy và có thể trigger thêm cookies

Nếu dùng `requests.get()` thuần, sẽ nhận được HTML nhưng không có `laravel_session` vì Laravel chỉ tạo session khi browser tương tác đúng cách. Playwright chạy Chromium thật → đảm bảo flow này xảy ra hoàn chỉnh.

### Tại sao dùng cùng sticky IP cho cả browser và crawler?

```python
# _build_proxy_args():
session_id = uuid.uuid4().hex[:8]          # ví dụ: "35329f20"
username = f"{username}-session-{session_id}"
# → u2efd59ce569505c1-zone-custom-region-vn-session-35329f20
```

Playwright navigate qua IP-X → server cài D1N cho IP-X vào browser.
Sau đó ViettelCrawler dùng **cùng session_id** → proxy luôn route đến IP-X → D1N vẫn hợp lệ.

Nếu dùng IP khác nhau cho browser và crawler, D1N sẽ không hợp lệ ở bước đầu crawl.

### Chi tiết từng bước trong `_fetch_credentials()`:

```python
# Bước 1: Khởi động Chromium với proxy và auth riêng biệt
browser = await pw.chromium.launch(
    headless=True,
    proxy={
        "server": "http://ap.proxy.2captcha.com:2334",
        "username": "u2efd59ce569505c1-...-session-35329f20",
        "password": "5tjlgB2A10rtxflSDCN2s7luGJ5wD",
    }
)
```

**Tại sao proxy auth phải truyền riêng (không nhúng vào URL)?**
Playwright cần thiết lập CONNECT tunnel cho HTTPS. Khi auth nhúng trong URL (`http://user:pass@host`), một số proxy không xử lý đúng CONNECT tunnel. Playwright hỗ trợ proxy dict với `username`/`password` riêng → đúng chuẩn RFC.

```python
# Bước 2: Tạo browser context với user-agent giống người thật
context = await browser.new_context(
    user_agent="Mozilla/5.0 ... Chrome/148.0.0.0 ...",
    ignore_https_errors=True,
)
```

**Tại sao `ignore_https_errors=True`?**
Một số proxy residential có thể không forward SSL cert chính xác. `ignore_https_errors=True` tránh crash vì SSL, nhưng vẫn mã hóa traffic.

```python
# Bước 3: Navigate đến trang SIM
await page.goto(
    "https://vietteltelecom.vn/di-dong/sim-so",
    timeout=30_000,
    wait_until="domcontentloaded",  # không đợi toàn bộ JS, chỉ cần DOM
)
```

**Tại sao `domcontentloaded` không phải `networkidle`?**
`networkidle` đợi tất cả network request kết thúc — với trang có analytics, ads, lazy-load thì có thể đợi 10-20s. Chỉ cần DOM load xong là đã có `<meta csrf-token>` và cookies, nên `domcontentloaded` đủ và nhanh hơn.

```python
# Bước 4: Đợi cookie laravel_session xuất hiện
await _wait_for_cookie(context, "laravel_session", timeout=30_000)
```

**Tại sao phải poll thay vì đợi event?**
Playwright không có event "cookie was set". Poll mỗi 0.5s, timeout 30s. Trong thực tế cookie xuất hiện sau 1-3s.

```python
# Bước 5: Extract x_csrf_token từ <meta> tag
meta_csrf = await page.evaluate(
    "document.querySelector('meta[name=\"csrf-token\"]')?.getAttribute('content') || ''"
)
```

**Tại sao extract từ meta tag, không dùng XSRF-TOKEN cookie?**

Có 2 token khác nhau:
- `XSRF-TOKEN` cookie: base64-encoded JSON dài ~200 ký tự, dùng cho header `X-XSRF-TOKEN`
- `<meta name="csrf-token">`: chuỗi ~40 ký tự, dùng cho header `x-csrf-token`

Viettel API validate header `x-csrf-token`, không phải `X-XSRF-TOKEN`. Test thực tế xác nhận: dùng meta token → 40 request thành công, dùng cookie token → không hoạt động.

### Tại sao phải chạy trong thread riêng khi gọi từ FastAPI?

```python
async def async_fetch_viettel_credentials():
    loop = asyncio.get_event_loop()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        result = await loop.run_in_executor(
            pool,
            lambda: asyncio.run(_fetch_credentials(...))
        )
```

FastAPI chạy trên Uvicorn với event loop của mình. `async_playwright()` context manager cũng muốn sở hữu event loop. Nếu gọi trực tiếp `await async_playwright()` trong FastAPI coroutine, xảy ra `NotImplementedError` vì 2 asyncio runtimes xung đột.

Giải pháp: spawn một thread mới (ThreadPoolExecutor), trong thread đó `asyncio.run()` tạo event loop riêng độc lập. FastAPI chỉ `await` kết quả thread → không xung đột.

---

## 4. Giai đoạn 2 — Tạo Job

**File:** `app.py` → `core/job_store.py`

### POST /api/jobs

```python
# app.py create_job()
meta = {
    "x_csrf_token": "TddMREMDu1inrn1yXalkOyxH8YwBymOfpQuLWKhK",
    "cookie": "D1N=54b74a...; laravel_session=yvkK...; XSRF-TOKEN=...",
    "proxy_session_id": "35329f20",
    "threads": 1,
}
job_id = store.create_job("viettel", "09????????", meta)
_start(job_id, "viettel")
```

### Trong `store.create_job()`:

```sql
-- Tạo row trong bảng jobs
INSERT INTO jobs VALUES (
    '35a1bc2d',         -- job_id (8 ký tự UUID)
    'viettel',          -- network
    '09????????',       -- pattern gốc (seed)
    'pending',          -- status ban đầu
    0,                  -- total_saved
    'data/viettel_35a1bc2d.csv',  -- output file
    'logs/35a1bc2d.log',           -- log file
    '2026-05-22T...',  -- created_at
    '2026-05-22T...',  -- updated_at
    '{"x_csrf_token": "...", "cookie": "...", "proxy_session_id": "...", "threads": 1}'
);

-- Seed pattern đầu tiên vào queue
INSERT INTO queue (job_id, pattern) VALUES ('35a1bc2d', '09????????');
```

**Tại sao lưu credentials vào SQLite (không phải RAM)?**

Nếu lưu RAM: server crash → restart → không còn credentials → không resume được.
Nếu lưu SQLite: server crash → restart → đọc từ DB → tạo lại `ViettelCrawler` với đúng credentials → resume hoàn toàn.

**Tại sao pattern seed là `"09????????"` (8 dấu `?`)?**

`?` là wildcard — mỗi `?` đại diện cho 1 chữ số chưa biết. `09????????` = tất cả số Viettel bắt đầu bằng 09x (khoảng 100 triệu số). Crawler sẽ thu hẹp dần từ pattern rộng xuống pattern hẹp (xem giai đoạn 6).

### `_start()`:

```python
def _start(job_id, network):
    crawler = ViettelCrawler(job_id, store)  # khởi tạo crawler
    _crawlers[job_id] = crawler              # lưu reference để pause/resume
    threads = store.get_meta(job_id).get("threads", 1)
    # Chạy trong background thread — không block FastAPI
    threading.Thread(target=crawler.run, kwargs={"threads": threads}, daemon=True).start()
```

**Tại sao daemon=True?**
Khi process chính (uvicorn) tắt, daemon threads tự chết theo. Không cần cleanup thủ công.

---

## 5. Giai đoạn 3 — Khởi tạo Crawler

**File:** `crawlers/viettel.py` → `ViettelCrawler.__init__()`

```python
def __init__(self, job_id, store):
    super().__init__(job_id, store)  # BaseCrawler setup

    # 1. Session HTTP duy nhất cho toàn bộ job
    self._session = requests.Session()
    self._session.headers.update(_HEADERS)

    # 2. Rate limiter
    self._rate_lock = threading.Lock()
    self._last_req_time = 0.0

    # 3. Đọc credentials từ DB
    meta = store.get_meta(job_id)

    # 4. Sticky proxy session ID
    self._proxy_session_id = meta.get("proxy_session_id") or uuid.uuid4().hex[:8]

    # 5. Set credentials vào session
    if meta.get("x_csrf_token"):
        self._session.headers["x-csrf-token"] = meta["x_csrf_token"]
    if meta.get("cookie"):
        for part in meta["cookie"].split(";"):
            if "=" in part:
                k, v = part.split("=", 1)
                self._session.cookies.set(k.strip(), v.strip())
```

### Tại sao dùng 1 `requests.Session()` cho toàn job?

`requests.Session()` giữ cookies tự động giữa các request. Quan trọng: khi server set cookie mới qua header `Set-Cookie` (ví dụ D1N mới), session tự cập nhật và dùng trong request tiếp theo — không cần code xử lý thủ công.

Nếu dùng `requests.get()` / `requests.post()` thuần (không Session), phải tự quản lý toàn bộ cookie jar → phức tạp và dễ bug.

### Tại sao `_proxy_session_id` có thể fallback về `uuid.hex[:8]`?

```python
self._proxy_session_id = meta.get("proxy_session_id") or uuid.uuid4().hex[:8]
```

Nếu user tạo job bằng cách paste cURL thủ công (không dùng auto-session), thì không có `proxy_session_id` trong meta. Trường hợp này:
- Fallback về random session ID mới
- Request đầu tiên sẽ đến IP mới → bị D1N challenge → auto-refresh D1N → request tiếp theo OK

Không crash, chỉ cần thêm 1 roundtrip ban đầu.

### Trong `BaseCrawler.__init__()`:

```python
# Setup logger ghi ra file logs/{job_id}.log
log_file = store.get_log_file(job_id)
self.logger = logging.getLogger(f"crawler.{job_id}")
# Đóng handlers cũ trước (tránh duplicate khi resume)
for h in self.logger.handlers[:]:
    h.close()
    self.logger.removeHandler(h)
handler = logging.FileHandler(log_file, encoding="utf-8")
```

**Tại sao phải đóng handlers cũ?**
Khi job được resume, `ViettelCrawler.__init__()` chạy lại. Python's logging dùng singleton cho mỗi logger name — nếu không đóng handler cũ, mỗi lần resume sẽ thêm 1 handler mới → log bị ghi trùng.

---

## 6. Giai đoạn 4 — Vòng lặp Crawl

**File:** `core/base_crawler.py`

### `run()` — Entry point

```python
def run(self, threads: int = 1):
    self._stop_event.clear()              # reset cờ dừng
    self._exit_queue = queue.Queue()      # reset scale-down queue
    self.store.requeue_processing(self.job_id)  # ← QUAN TRỌNG
    self.store.set_status(self.job_id, JobStatus.RUNNING)
    self._run_workers(threads)
```

**`requeue_processing()` làm gì và tại sao cần?**

```sql
UPDATE queue SET status='pending' 
WHERE job_id=? AND status='processing'
```

Khi một pattern được pop ra khỏi queue, nó được mark `processing`. Nếu trong lúc đó server crash (kill -9, power off), pattern đó sẽ mãi là `processing` — không ai xử lý nữa nhưng cũng không về `pending`.

Khi job restart/resume, `requeue_processing()` reset tất cả `processing` → `pending` để xử lý lại. Safe vì: nếu pattern đó đã được xử lý xong trước khi crash, nó đã được mark `done` rồi — chỉ còn những cái thực sự stuck mới ở `processing`.

### `_run_workers()` — Spawn threads

```python
def _run_workers(self, threads: int):
    for i in range(1, threads + 1):
        self._spawn_worker(i)           # spawn N worker threads

    while True:                         # thread chính chờ
        with self._threads_lock:
            if self._active_count == 0:
                break
        time.sleep(0.3)

    # Sau khi tất cả workers xong:
    if not self._stop_event.is_set():
        self.store.set_status(self.job_id, JobStatus.COMPLETED)
```

**Tại sao thread chính (`crawler.run()`) phải chờ?**

`_start()` gọi `crawler.run()` trong một daemon thread. Thread đó phải sống đến khi crawl xong để có thể set status COMPLETED. Nếu return sớm, không biết lúc nào crawl kết thúc.

### `_worker_loop()` — Logic từng worker thread

```python
def _worker_loop(self, thread_num):
    spin_cycles = 0
    while not self._stop_event.is_set():

        # 1. Kiểm tra scale-down signal
        try:
            self._exit_queue.get_nowait()
            return  # exit này thread
        except queue.Empty:
            pass

        # 2. Kiểm tra DB có bị pause không (từ API call)
        job = self.store.get_job(self.job_id)
        if job["status"] == JobStatus.PAUSED:
            return

        # 3. Lấy pattern tiếp theo
        pattern = self.store.pop_next(self.job_id)

        if pattern is None:
            progress = self.store.get_progress(self.job_id)
            if progress["pending"] == 0:
                return  # queue thực sự rỗng, xong rồi

            spin_cycles += 1
            if spin_cycles >= 10:  # đã spin 2s (10 × 0.2s)
                with self._threads_lock:
                    is_last = self._active_count == 1
                if is_last:
                    self.store.requeue_processing(self.job_id)
                    # ← self-heal: last worker phát hiện stuck rows
            time.sleep(0.2)
            continue

        spin_cycles = 0
        self._process(pattern)  # xử lý pattern
```

**Tại sao cần kiểm tra DB status (bước 2) thay vì chỉ dùng `_stop_event`?**

`_stop_event` được set bởi `pause()` (gọi từ API). Nhưng còn 1 trường hợp nữa: user pause qua DB (ví dụ direct SQL update). Kiểm tra DB đảm bảo worker không bỏ lỡ tín hiệu dừng từ bất kỳ nguồn nào.

**Tại sao worker cuối cùng mới được phép `requeue_processing()`?**

Nếu có nhiều worker đang chạy và worker A spin (không lấy được pattern), có thể worker B đang xử lý cái cuối cùng. Nếu A requeue ngay, B đang giữ pattern đó có thể bị xử lý 2 lần → data duplicate.

Chỉ khi `active_count == 1` (worker cuối) mà vẫn không có pattern → chắc chắn không ai đang giữ gì → safe to requeue.

### `pop_next()` — Lấy pattern atomic

```python
def pop_next(self, job_id):
    with self._db_lock:
        row = self.conn.execute(
            "SELECT id, pattern FROM queue WHERE job_id=? AND status='pending' LIMIT 1",
            (job_id,)
        ).fetchone()
        if not row:
            return None
        self.conn.execute(
            "UPDATE queue SET status='processing' WHERE id=?", (row["id"],)
        )
        self.conn.commit()
        return row["pattern"]
```

**Tại sao dùng `_db_lock` và transaction?**

Với nhiều threads đồng thời, 2 threads có thể cùng SELECT cùng 1 row rồi cả 2 xử lý → duplicate. `_db_lock` là Python-level lock đảm bảo SELECT + UPDATE là atomic trong context multi-threading.

SQLite cũng có internal locking nhưng Python SQLite wrapper có thể không enforce đủ mạnh trong multi-thread mode → double lock cho chắc.

---

## 7. Giai đoạn 5 — Mỗi lần fetch

**File:** `crawlers/viettel.py` → `fetch()`

Đây là phần phức tạp nhất. Mỗi lần gọi `fetch(pattern)`:

### Bước 7.1 — Throttle (Rate Limiter)

```python
def _throttled_post(self, pattern, proxies):
    with self._rate_lock:
        wait = _RATE_DELAY - (time.time() - self._last_req_time)
        if wait > 0:
            time.sleep(wait)          # ngủ nếu chưa đủ 3s
        resp = self._session.post(    # ← request NẰM TRONG LOCK
            self.API_URL,
            json={...},
            proxies=proxies,
            timeout=15,
        )
        self._last_req_time = time.time()
    return resp
```

**`_RATE_DELAY = 3.0s` — tại sao chọn 3 giây?**

Viettel rate limit: ~20 request / 30 giây sliding window = tối đa 1 request/1.5s.
Chọn 3s (gấp đôi giới hạn) để có buffer an toàn. Test 40 requests ở 3s = 0 rate limit hits.

**Tại sao HTTP request nằm TRONG lock?**

Nếu request nằm ngoài lock:
- Thread A: kiểm tra thời gian, ngủ 3s, lock được release
- Thread B: kiểm tra thời gian (vẫn thấy cần đợi), lock được release
- Thread A và B cùng gửi request gần như đồng thời → vi phạm rate limit

Giữ lock trong suốt request đảm bảo: Thread B không bắt đầu đến khi Thread A xong hoàn toàn (kể cả nhận response), và `_last_req_time` được cập nhật chính xác.

**Hệ quả với multi-thread:** Với 1 laravel_session, tăng thread count không giúp tăng tốc vì tất cả serialize qua lock này. Đây là đặc điểm của rate-limit per-session của Viettel, không phải bug.

### Bước 7.2 — Kiểm tra D1N Challenge

```python
if 'text/html' in resp.headers.get('content-type', ''):
    if not self._refresh_d1n(resp):
        raise SessionExpiredError("D1N: could not extract new token")
    resp = self._throttled_post(pattern, proxies)  # retry với D1N mới
    if 'text/html' in resp.headers.get('content-type', ''):
        raise SessionExpiredError("D1N refresh failed")
```

**Tại sao detect bằng `content-type: text/html`?**

D1N challenge: server trả HTTP 200 với `Content-Type: text/html` thay vì `application/json`. Không có status code đặc biệt (không phải 401, 403). Đây là anti-bot trick: tool đơn giản sẽ thấy HTTP 200 và cố parse JSON → fail.

**`_refresh_d1n()` làm gì?**

```python
def _refresh_d1n(self, resp):
    m = re.search(r'D1N=([a-f0-9]+)', resp.text)
    if not m:
        return False
    self._session.cookies.set('D1N', m.group(1))  # update cookie trong session
    return True
```

Extract D1N mới từ JS trong HTML:
```html
<script>document.cookie="D1N=1505743d0d3b383bca84c32f602f0ac6; path=/"</script>
```

Regex `D1N=([a-f0-9]+)` bắt được hex hash. Set vào `self._session.cookies` → tất cả request tiếp theo tự động mang D1N mới.

**Retry ngay sau refresh có bị rate limit không?**

Retry gọi `_throttled_post()` → phải đợi thêm 3s nữa do rate lock. Tổng cộng 1 D1N challenge = mất 2 requests + 3s thêm. Chấp nhận được.

**Nếu retry vẫn bị HTML challenge?**

→ `raise SessionExpiredError("D1N refresh failed")`

Điều này xảy ra khi proxy thực sự không hoạt động hoặc IP bị Viettel block. `SessionExpiredError` làm job FAILED ngay (xem bước sau).

### Bước 7.3 — Kiểm tra 419 Session Expired

```python
if resp.status_code == 419:
    raise SessionExpiredError("HTTP 419 — laravel_session/x-csrf-token het han")
```

**419 là gì?**

HTTP 419 là response code Laravel dùng cho CSRF mismatch. Không phải HTTP standard. Xảy ra khi:
1. `laravel_session` cookie hết hạn (thường sau vài giờ)
2. `x-csrf-token` header không khớp với session

**Tại sao raise `SessionExpiredError` thay vì retry?**

Không thể tự renew `laravel_session` mà không có browser. Tiếp tục cố gắng chỉ lãng phí thời gian. `SessionExpiredError` → job FAILED với message rõ ràng → user thấy cần lấy credentials mới.

### Bước 7.4 — Kiểm tra errorCode=1 (Rate Limited)

```python
if error_code == 1:
    self.logger.warning(f"[RATE] ec=1 pattern={pattern}, sleeping 60s")
    time.sleep(60)              # ngủ 60s để window reset
    resp2 = self._throttled_post(pattern, proxies)
    data = resp2.json()
    error_code = data.get("errorCode")
    # tiếp tục xử lý với data mới
```

**Tại sao ngủ 60s (không phải 30s)?**

Rate limit là sliding window 30s. Sau 30s tất cả request cũ ra khỏi window nhưng nếu retry ngay ở giây 30, vẫn có thể bị limit nếu có request khác chen vào. 60s = an toàn tuyệt đối, window đã hoàn toàn reset.

**Tại sao không raise exception khi ec=1?**

Code cũ raise ValueError → `mark_failed()` → pattern bị đánh dấu `failed`, không xử lý lại trừ khi user bấm Retry. Mất dữ liệu.

ec=1 là trạng thái TẠM THỜI, không phải lỗi vĩnh viễn. Ngủ 60s là đúng behavior, không phải failure.

### Bước 7.5 — Kiểm tra errorCode khác

```python
if error_code != 0:
    raise ValueError(f"API errorCode={error_code} msg={data.get('message', '')}")
```

`errorCode=0` = thành công. Các code khác (2, 3, ...) là lỗi không rõ → raise ValueError → pattern bị `mark_failed()`. Có thể retry sau.

---

## 8. Giai đoạn 6 — Xử lý kết quả và mở rộng pattern

**File:** `core/base_crawler.py` → `_process()`

```python
def _process(self, pattern):
    numbers = self.fetch(pattern)   # danh sách số điện thoại trả về

    if len(numbers) < self.THRESHOLD:  # THRESHOLD = 30
        # Đủ ít → đây là "leaf" pattern → lưu luôn
        self._save(numbers)
        self.store.mark_done(self.job_id, pattern)

    elif "?" in pattern:
        # Quá nhiều kết quả → cần thu hẹp → expand thành 10 sub-patterns
        idx = pattern.index("?")    # tìm dấu ? đầu tiên
        children = [
            pattern[:idx] + d + pattern[idx+1:]
            for d in "0123456789"   # thay ? bằng 0-9
        ]
        # Ví dụ: "0352??????" → ["03520?????", "03521?????", ..., "03529?????"]
        self.store.enqueue(self.job_id, children)
        self.store.mark_done(self.job_id, pattern)

    else:
        # Không còn ? nhưng vẫn >= THRESHOLD → lưu hết (không thể thu hẹp nữa)
        self._save(numbers)
        self.store.mark_done(self.job_id, pattern)
```

### Tại sao THRESHOLD = 30?

API Viettel trả tối đa 50 kết quả/request (`page_size=50`). Nếu kết quả < 30, có nghĩa pattern đủ cụ thể — không cần phân tách nữa.

Nếu kết quả = 50 (tối đa), không biết có bao nhiêu số thực sự (có thể 50, có thể 500). Phải thu hẹp pattern để đảm bảo không bỏ sót.

Chọn 30 (không phải 50) vì: 30-49 kết quả cho pattern cụ thể là chấp nhận được, tiết kiệm requests thay vì expand quá sâu.

### Ví dụ expansion tree:

```
"09????????" (8 wildcards)
  → 50 kết quả → expand
    "090???????" → 50 → expand
      "0900??????" → 50 → expand
        ...
      "0901??????" → 25 → SAVE (leaf)
      "0902??????" → 50 → expand
        "09020?????" → 12 → SAVE
        "09021?????" → 50 → expand
          ...
```

Tổng số patterns trong worst case: 10^8 (100M patterns nếu toàn bộ đều = 50). Thực tế: hầu hết số không tồn tại → nhiều patterns trả 0 → leaf ngay ở cấp sâu.

### `_save()`:

```python
def _save(self, numbers):
    if not numbers: return
    output_file = self.store.get_output_file(self.job_id)
    with self._file_lock:                      # tránh concurrent write
        with open(output_file, "a") as f:     # append mode
            for n in sorted(numbers):
                f.write(n + "\n")
    self.store.increment_saved(self.job_id, len(numbers))
```

**Tại sao `sorted()`?**
Số điện thoại trong cùng 1 batch được sort → file CSV dễ đọc và deduplicate hơn khi merge sau.

**Tại sao `_file_lock`?**
Nhiều worker threads có thể đồng thời gọi `_save()`. Không lock → file corruption (2 threads cùng ghi vào file → dữ liệu lẫn lộn).

---

## 9. Pause / Resume / Retry

### Pause

```python
# API: POST /api/jobs/{id}/pause
def _pause(job_id):
    store.set_status(job_id, JobStatus.PAUSED)  # 1. set DB trước
    c = _crawlers.get(job_id)
    if c:
        c.pause()                                # 2. set stop_event

# Trong BaseCrawler:
def pause(self):
    self._stop_event.set()
```

**Tại sao set DB TRƯỚC rồi mới set stop_event?**

Worker loop check `_stop_event` VÀ check DB status. Nếu set stop_event trước khi DB update, worker có thể stop trước khi DB được update, rồi `_run_workers()` thấy stop_event → log "PAUSED" nhưng không check DB → `set_status(COMPLETED)` → sai.

Set DB trước đảm bảo: dù worker kiểm tra bằng cách nào (stop_event hay DB), đều thấy đúng trạng thái.

**Điều gì xảy ra với pattern đang xử lý khi pause?**

Pattern đang `processing` sẽ ở lại `processing` trong DB. Khi resume, `requeue_processing()` reset về `pending`. Pattern đó được xử lý lại từ đầu. Đây là acceptable — worst case xử lý 1 pattern 2 lần, nhưng số điện thoại sẽ deduplicate ở bước filter sau.

### Resume

```python
# API: POST /api/jobs/{id}/resume
def resume_job(job_id, body):
    _start(job_id, job["network"])  # tạo crawler mới, chạy lại

# Trong run():
self.store.requeue_processing(self.job_id)  # reclaim stuck rows
```

Resume = tạo một `ViettelCrawler` instance mới với cùng job_id. `__init__()` đọc credentials từ DB → credentials vẫn còn (giả sử chưa hết hạn). Queue trong DB còn nguyên → tiếp tục từ chỗ dừng.

### Retry (failed patterns)

```python
# API: POST /api/jobs/{id}/retry
store.requeue_failed(job_id)  # failed → pending
_start(job_id, network)        # chạy lại
```

Reset tất cả `failed` patterns về `pending`, rồi start job. Useful khi: network error tạm thời, proxy đứt rồi khôi phục, v.v.

---

## 10. Sơ đồ tổng thể

```
USER BẤM "🤖 Tự động"
│
├─ POST /api/viettel/auto-session
│    │
│    ├─ Generate sticky_session_id (uuid 8 char)
│    ├─ Playwright launch Chromium
│    │    proxy: ap.proxy.2captcha.com:2334
│    │    user:  username-session-{sticky_id}
│    │    pass:  ***
│    │
│    ├─ Navigate → vietteltelecom.vn/di-dong/sim-so
│    ├─ Đợi cookie "laravel_session" xuất hiện
│    ├─ Extract <meta name="csrf-token"> → x_csrf_token
│    ├─ Extract cookies: D1N, laravel_session, XSRF-TOKEN
│    └─ Return {x_csrf_token, cookie, proxy_session_id}
│
USER BẤM "🚀 Start Job"
│
├─ POST /api/jobs
│    ├─ Validate credentials, proxy config
│    ├─ store.create_job() → jobs.db
│    │    jobs:  INSERT (id, network, pattern, meta{creds, proxy_session_id})
│    │    queue: INSERT (job_id, pattern="09????????", status="pending")
│    └─ _start() → spawn daemon thread → crawler.run()
│
CRAWLER THREAD CHẠY
│
├─ run()
│    ├─ requeue_processing()     ← reclaim stuck rows từ crash cũ
│    ├─ set_status(RUNNING)
│    └─ _run_workers(threads=1)
│         └─ spawn worker thread(s)
│
WORKER LOOP (lặp liên tục)
│
├─ pop_next() → lấy "09????????" từ queue (→ status=processing)
│
├─ _process("09????????")
│    │
│    └─ fetch("09????????")
│         │
│         ├─ build_proxies(session_id="35329f20")
│         │    → http://user-session-35329f20:pass@proxy:2334
│         │
│         ├─ _throttled_post() ← giữ lock, đợi 3s, gửi request
│         │
│         ├─ Content-Type: text/html? → D1N challenge
│         │    ├─ _refresh_d1n(): extract D1N mới từ HTML
│         │    ├─ set session.cookies["D1N"] = mới
│         │    └─ _throttled_post() retry
│         │
│         ├─ status 419? → SessionExpiredError → job FAILED
│         │
│         ├─ errorCode=1? → sleep(60s) → retry
│         │
│         └─ errorCode=0 → return [list of phone numbers]
│
│    ├─ len(numbers) < 30? → LEAF
│    │    ├─ _save() → append to data/viettel_{job_id}.csv
│    │    └─ mark_done("09????????")
│    │
│    └─ len(numbers) >= 30? → EXPAND
│         ├─ enqueue(["090???????", "091???????", ..., "099???????"])
│         └─ mark_done("09????????")
│
├─ pop_next() → "090???????"
├─ ... (tiếp tục đệ quy)
│
└─ pop_next() → None (queue rỗng)
     └─ set_status(COMPLETED)

KẾT QUẢ
└─ data/viettel_{job_id}.csv chứa tất cả số điện thoại tìm được
```

---

## Bảng tổng hợp các lỗi và cách xử lý

| Tình huống | HTTP / errorCode | Xử lý | Lý do |
|---|---|---|---|
| D1N challenge | 200 text/html | Extract D1N mới → retry 1 lần | Rotating proxy IP, IP mới cần D1N riêng |
| D1N retry thất bại | 200 text/html lần 2 | `SessionExpiredError` → FAILED | IP bị block hoặc proxy lỗi, không tự khắc phục được |
| Session expired | HTTP 419 | `SessionExpiredError` → FAILED | Cần lấy credentials mới từ browser |
| Rate limited | errorCode=1 | sleep(60s) → retry 1 lần | Sliding window reset sau 30s, 60s đảm bảo an toàn |
| Network error | requests exception | `mark_failed(pattern)` | Tạm thời, retry job để xử lý lại |
| Process crash | — | requeue_processing() lúc resume | Pattern stuck ở `processing` được reclaim |
| Server restart | — | Auto-PAUSED startup, user resume | Jobs.db là source of truth |
