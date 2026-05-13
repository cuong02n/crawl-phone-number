import time
import requests
import urllib3
import logging
import json
import os
import sys
import argparse

# --- Cấu hình Argument ---
parser = argparse.ArgumentParser(description='Viettel Sim Crawler Unified')
parser.add_argument('--pattern', type=str, default="09????????", help='Pattern to search (e.g. 09????????)')
args = parser.parse_args()

PATTERN_INPUT = args.pattern

# --- Setup Logging ---
log_file = 'error_viettel.log'
logging.basicConfig(
    filename=log_file,
    filemode='a',
    format='%(asctime)s - %(levelname)s - %(message)s',
    level=logging.INFO # Chuyển sang INFO để thấy tiến trình
)

# File để lưu kết quả (Gộp chung tất cả Viettel)
OUTPUT_FILE = "viettel_all.csv"
CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.json')

current_pattern = "?" * len(PATTERN_INPUT)

def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'r') as f:
            return json.load(f)
    return {}

def is_valid_input(s):
    def char_value(c):
        return -1 if c == '?' else int(c)
    for i in range(len(s)):
        v1 = char_value(current_pattern[i])
        v2 = char_value(s[i])
        if v1 < v2: return True
        elif v1 > v2: return False
    return True

def query_server(pattern):
    config = load_config()
    username = config.get("username", "z")
    password = config.get("password", "z")
    proxy_dns = config.get("proxy_dns", "")

    url = "https://vietteltelecom.vn/api/get/sim"
    
    headers = {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/json;charset=UTF-8',
        'origin': 'https://vietteltelecom.vn',
        'referer': 'https://vietteltelecom.vn/di-dong/sim-so',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'x-xsrf-token': 'eyJpdiI6InpQU0dUQ09XMkZhSm5lZndYWUpsTGc9PSIsInZhbHVlIjoiNGdDUkx2b0xmbzE1d0VDK2FsQ00rakR4MHpVenVTU0lrcTdSU3ZGRTQ2UE40NSs1QzRRcjFqV1FJVkhoazU3WSIsIm1hYyI6IjQ3MzljNmQyMGE4ZmRjNzc0ODdlZDY1Y2U1MWY4NjliMjg4OWY2NTQ0NjQ1ZDIzMjhiM2M0MmZkMWFkYWU3NzIifQ==',
        'Cookie': 'D1N=165828b83086199e87cba40c4d8cf5ad; XSRF-TOKEN=eyJpdiI6Ind0MjQyXC93aHBBZjdMVThQWTl1alF3PT0iLCJ2YWx1ZSI6IlRXTDRiQ1oyZll6MzhiTkZlTUszOVk1N2VyWGcyR2V6ME5LdTlmampoSGlqRnZ4c0NzYkc0RUptclBiVU1GXC80IiwibWFjIjoiYmZkODY4MzIxYTEzNDU5NDk2MjljMjYwMGEzMjc5Nzk1MTMxNDBjZmU3MWIyMTc2YjNjOGY2NzVjZTdiN2FhYiJ9; laravel_session=ZtsloajYhPT0YAtHPV5DOn38jrVeiG9QTsQBDFEx'
    }
    
    payload = {
        "key_search": pattern,
        "page": 1,
        "page_size": 50,
        "total_record": 1,
        "isdn_type": 2,
        "captcha": "",
        "sid": "",
        "page_type": ""
    }

    try:
        proxies = None
        if proxy_dns:
            proxies = {
                "https": f"http://{username}:{password}@{proxy_dns}",
                "http": f"http://{username}:{password}@{proxy_dns}"
            }
            
        response = requests.post(url, headers=headers, json=payload, proxies=proxies, timeout=5)
        if response.status_code != 200:
            logging.error(f"Lỗi HTTP {response.status_code} cho pattern {pattern}. Body: {response.text[:200]}")
            return None
            
        return response.json()
    except Exception as e:
        logging.error(f"Lỗi truy vấn {pattern}: {e}")
        time.sleep(1)
        return query_server(pattern)

def save_to_file(numbers):
    if not numbers: return
    try:
        with open(OUTPUT_FILE, "a") as f:
            for number in numbers:
                f.write(number + "\n")
    except Exception as e:
        logging.error(f"Lỗi khi lưu file: {e}")

def crawl_pattern(pattern):
    logging.info(f"📍 TRẠNG THÁI: Đang quét nhánh '{pattern}'...")
    
    if not is_valid_input(pattern):
        if is_valid_input(pattern.replace('?', '9')):
            for i in range(10):
                if "?" in pattern:
                    crawl_pattern(pattern.replace('?', str(i), 1))
        return

    response = query_server(pattern)
    if not response or response.get("errorCode") != 0:
        err_msg = json.dumps(response, ensure_ascii=False) if response else "No Response"
        logging.error(f"❌ LỖI API pattern {pattern}: {err_msg}")
        # Đợi một chút rồi thử lại để tránh bị chặn hoàn toàn
        time.sleep(2)
        crawl_pattern(pattern)
        return

    data = response.get("data", [])
    numbers = []
    for item in data:
        isdn = str(item.get("isdn", ""))
        if len(isdn) == 9:
            isdn = "0" + isdn
        if isdn:
            numbers.append(isdn)
            
    logging.info(f"✅ KẾT QUẢ: Tìm thấy {len(numbers)} số với pattern {pattern}")

    if 30 > len(numbers):
        numbers.sort()
        save_to_file(numbers)
        return

    for i in range(10):
        crawl_pattern(pattern.replace('?', str(i), 1))

if __name__ == '__main__':
    logging.info(f"🚀 === BẮT ĐẦU CÀO VIETTEL: {PATTERN_INPUT} ===")
    crawl_pattern(PATTERN_INPUT)
