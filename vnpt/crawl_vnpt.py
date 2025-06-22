import threading

import requests
import urllib3
import logging

logging.basicConfig(
    filename='error.log',  # Tên file log
    filemode='a',  # 'a' để ghi nối tiếp, 'w' để ghi đè
    format='%(asctime)s - %(levelname)s - %(message)s',
    level=logging.ERROR  # Chỉ ghi các log mức ERROR trở lên
)

# File để lưu kết quả
OUTPUT_PREFIX = "E:\sim_data/vnpt/result_"
prefixs = ['82', '85', '88', '91', '94']


def query_server(pattern, prefix):
    try:
        request_url = f"https://digishop.vnpt.vn/apiprod/sim/num_search3?prefix=84{prefix}&search={pattern}*"
        username = "z"
        password = "z"
        proxy_dns = "43.153.237.55:2334"

        proxy = {
            "https": "http://{}:{}@{}".format(username, password, proxy_dns),
            "http": "http://{}:{}@{}".format(username, password, proxy_dns)
        }
        response = requests.get(
            request_url,
            # proxies=proxy,
            timeout=5
        )
        if response.status_code != 200:
            logging.error(
                f"Lỗi HTTP {response.status_code} khi truy vấn pattern {pattern}, response = {(response.content[:100]) if (len(response.content) > 100) else response.content}")
        response_data = response.json()
        return response_data
    except requests.exceptions.Timeout:
        logging.error(f"Timeout, pattern: {pattern}, retry")
    except requests.exceptions.ProxyError:
        logging.error(f"Requests ProxyError, pattern: {pattern}, retry")
    except urllib3.exceptions.ProxyError:
        logging.error(f"Urllib3 ProxyError, pattern: {pattern}, retry")
    except urllib3.exceptions.MaxRetryError:
        logging.error(f"MaxRetryError, pattern: {pattern}, retry")
    except urllib3.exceptions.SSLError:
        logging.error(f"SSLError, pattern: {pattern}, retry")
    except urllib3.exceptions.ReadTimeoutError:
        logging.error(f"ReadTimeoutError, pattern: {pattern}, retry")
    except Exception as e:
        logging.error(f"Unknown error: {e}, retry")
    return query_server(pattern, prefix)


def save_to_file(numbers, prefix):
    if len(numbers) == 0:
        return
    try:
        with open(OUTPUT_PREFIX + prefix + '.csv', "a") as f:
            for number in numbers:
                f.write(number + "\n")
    except Exception as e:
        logging.error(f"Lỗi khi lưu file: {e}")


def crawl_pattern(pattern, prefix):
    print(f"Prefix: {prefix}, Pattern: {pattern}")

    response = query_server(pattern, prefix)
    # # time.sleep(2)
    if not response or response.get("errorCode") != '0':
        logging.error(f"Lỗi khi truy vấn pattern {pattern}: {response}, retry")
        crawl_pattern(pattern, prefix)
        return
    print(f"Total item: {int(response.get('totalItems'))}")
    if 50 > int(response.get("totalItems")):
        print(" -> save")
        data = response.get("data", [])
        numbers = [item["so_tb"][2:] for item in data]

        numbers.sort()
        save_to_file(numbers, prefix)
        return

    for i in range(10):
        if len(pattern) < 7:
            sub_pattern = pattern + str(i)
            crawl_pattern(sub_pattern, prefix)


if __name__ == '__main__':
    threads = []

    for prefix in prefixs:
        thread = threading.Thread(target=crawl_pattern, args=("", prefix))
        thread.start()
        threads.append(thread)

    # Chờ tất cả các thread hoàn thành
    for thread in threads:
        thread.join()
