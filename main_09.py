import time

import requests
import urllib3
import logging

logging.basicConfig(
    filename='error_09_tratruoc.log',  # Tên file log
    filemode='a',  # 'a' để ghi nối tiếp, 'w' để ghi đè
    format='%(asctime)s - %(levelname)s - %(message)s',
    level=logging.ERROR  # Chỉ ghi các log mức ERROR trở lên
)

# File để lưu kết quả
OUTPUT_FILE = "result_09_tratruoc.csv"

current_pattern = "??????????"


def is_valid_input(s):
    def char_value(c):
        return -1 if c == '?' else int(c)

    for i in range(len(s)):
        v1 = char_value(current_pattern[i])
        v2 = char_value(s[i])
        if v1 < v2:
            return True
        elif v1 > v2:
            return False
    return True


def query_server(pattern):
    try:
        request_url = f"https://apigami.viettel.vn/mvt-api/myviettel.php/omiSearchSimV2?isdn_type=2&page_type=&page=1&page_size=50&key_search={pattern}&total_record=1&captcha=&sid="
        username = "z"
        password = "z"
        proxy_dns = "43.153.237.55:2334"
        proxy = {
            "https": "http://{}:{}@{}".format(username, password, proxy_dns),
            "http": "http://{}:{}@{}".format(username, password, proxy_dns)
        }
        response = requests.post(
            request_url,
            proxies=proxy,
            timeout=5
        )
        if response.status_code != 200:
            logging.error(
                f"Lỗi HTTP {response.status_code} khi truy vấn pattern {pattern}, response = {(response.content[:100]) if (len(response.content) > 100) else response.content}")
        response_data = response.json()

        return response_data
    except requests.exceptions.Timeout:
        logging.error(f"Timeout, pattern: {pattern}, retry")
        return query_server(pattern)
    except requests.exceptions.ProxyError:
        logging.error(f"Requests ProxyError, pattern: {pattern}, retry")
        return query_server(pattern)
    except urllib3.exceptions.ProxyError:
        logging.error(f"Urllib3 ProxyError, pattern: {pattern}, retry")
        return query_server(pattern)
    except urllib3.exceptions.MaxRetryError:
        logging.error(f"MaxRetryError, pattern: {pattern}, retry")
        return query_server(pattern)
    except urllib3.exceptions.SSLError:
        logging.error(f"SSLError, pattern: {pattern}, retry")
        return query_server(pattern)
    except urllib3.exceptions.ReadTimeoutError:
        logging.error(f"ReadTimeoutError, pattern: {pattern}, retry")
        return query_server(pattern)
    except Exception as e:
        logging.error(f"Unknown error: {e}, retry")
        return query_server(pattern)


def save_to_file(numbers):
    if len(numbers) == 0:
        return
    try:
        with open(OUTPUT_FILE, "a") as f:
            for number in numbers:
                f.write(number + "\n")
    except Exception as e:
        logging.error(f"Lỗi khi lưu file: {e}")


def crawl_pattern(pattern):
    print(f"Pattern: {pattern}")
    if not is_valid_input(pattern):
        if is_valid_input(pattern.replace('?', str(9))):
            for i in range(10):
                if "?" in pattern:
                    sub_pattern = pattern.replace('?', str(i), 1)
                    crawl_pattern(sub_pattern)
        return
    response = query_server(pattern)
    if not response or response.get("errorCode") != 0:
        logging.error(f"Lỗi khi truy vấn pattern {pattern}: {response}, retry")
        crawl_pattern(pattern)
        return
    data = response.get("data", [])
    numbers = [item["isdn"] for item in data]
    print(f"{len(numbers)} numbers")

    if 30 > len(numbers):
        numbers.sort()
        save_to_file(numbers)
        return

    for i in range(10):
        sub_pattern = pattern.replace('?', str(i), 1)
        crawl_pattern(sub_pattern)


if __name__ == '__main__':
    crawl_pattern("09????????")
