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
PREFIX = PATTERN_INPUT[:2] if len(PATTERN_INPUT) >= 2 else "unknown"

# --- Setup Logging ---
log_file = f'error_{PREFIX}.log'
logging.basicConfig(
    filename=log_file,
    filemode='a',
    format='%(asctime)s - %(levelname)s - %(message)s',
    level=logging.ERROR
)

# File để lưu kết quả
OUTPUT_FILE = f"result_{PREFIX}_tratruoc.csv"
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

    try:
        request_url = f"https://apigami.viettel.vn/mvt-api/myviettel.php/omiSearchSimV2?isdn_type=2&page_type=&page=1&page_size=50&key_search={pattern}&total_record=1&captcha=&sid="
        
        proxies = None
        if proxy_dns:
            proxies = {
                "https": f"http://{username}:{password}@{proxy_dns}",
                "http": f"http://{username}:{password}@{proxy_dns}"
            }
            
        response = requests.post(request_url, proxies=proxies, timeout=5)
        if response.status_code != 200:
            logging.error(f"Lỗi HTTP {response.status_code} cho pattern {pattern}")
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
    print(f"Bắt đầu quét Pattern: {pattern}")
    if not is_valid_input(pattern):
        if is_valid_input(pattern.replace('?', '9')):
            for i in range(10):
                if "?" in pattern:
                    crawl_pattern(pattern.replace('?', str(i), 1))
        return

    response = query_server(pattern)
    if not response or response.get("errorCode") != 0:
        logging.error(f"Lỗi pattern {pattern}: {response}")
        crawl_pattern(pattern)
        return

    data = response.get("data", [])
    numbers = [item["isdn"] for item in data]
    print(f"Tìm thấy {len(numbers)} số với pattern {pattern}")

    if 30 > len(numbers):
        numbers.sort()
        save_to_file(numbers)
        return

    for i in range(10):
        crawl_pattern(pattern.replace('?', str(i), 1))

if __name__ == '__main__':
    print(f"🚀 Unified Crawler started for: {PATTERN_INPUT}")
    crawl_pattern(PATTERN_INPUT)
