import time

import requests

# URL API của server (thay thế bằng URL thực tế)
API_URL = "https://vietteltelecom.vn/api/get/sim"

# File để lưu kết quả
OUTPUT_FILE = "results.txt"

current_pattern = "0333997597"


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
    request_url = f"https://apigami.viettel.vn/mvt-api/myviettel.php/omiSearchSimV2?isdn_type=22&page_type=&page=1&page_size=50&key_search={pattern}&total_record=1&captcha=&sid=";
    print("querying")
    response = requests.post(
        request_url,
        proxies={
            "http": "http://rrbrigxf:affxtr7giqm5@198.23.239.134:6540/",
            "https": "http://rrbrigxf:affxtr7giqm5@198.23.239.134:6540/"
        }
    )
    # print(response.content)
    if response.status_code != 200:
        print(
            f"Lỗi HTTP {response.status_code} khi truy vấn pattern {pattern}, response = {(response.content[:100]) if (len(response.content) > 100) else response.content}")
        return None
    print(f"response = {(response.content[:100]) if (len(response.content) > 100) else response.content}")
    # Trích xuất JSON từ response
    response_data = response.json()
    return response_data


def save_to_file(numbers):
    try:
        with open(OUTPUT_FILE, "a") as f:
            for number in numbers:
                f.write(number + "\n")
        print(f"Lưu {len(numbers)} số điện thoại vào file.")
    except Exception as e:
        print(f"Lỗi khi lưu file: {e}")


def crawl_pattern(pattern):
    print(f"Truy vấn pattern: {pattern}")
    if current_pattern > pattern:
        print(f"Last pattern: {current_pattern}, pattern query: {pattern}")
        return
    response = query_server(pattern)
    time.sleep(2)
    if not response or response.get("errorCode") != 0:
        print(f"Lỗi khi truy vấn pattern {pattern}: {response}")
        raise ValueError("Limit rate")
    data = response.get("data", [])
    numbers = [item["isdn"] for item in data]

    if len(numbers) < 50:
        numbers.sort()
        save_to_file(numbers)
        print(f'saved {len(numbers)} to file')
        return

    # Nếu số lượng kết quả > 50, chia nhỏ pattern và đệ quy
    for i in range(10):
        sub_pattern = pattern.replace('?', str(i), 1)

        crawl_pattern(sub_pattern)


if __name__ == '__main__':
    crawl_pattern("03????????")
