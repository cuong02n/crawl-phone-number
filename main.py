import time

import requests

# File để lưu kết quả
OUTPUT_FILE = "result.csv"

current_pattern = "032551????"


def is_valid_input(s):
    def char_value(c):
        return -1 if c == '?' else int(c)

    for i in range(len(s)):
        v1 = char_value(current_pattern[i])
        v2 = char_value(s[i])
        # print(v1, v2)
        if v1 < v2:
            return True
        elif v1 > v2:
            return False
    return True


def query_server(pattern):
    request_url = f"https://apigami.viettel.vn/mvt-api/myviettel.php/omiSearchSimV2?isdn_type=22&page_type=&page=1&page_size=50&key_search={pattern}&total_record=1&captcha=&sid="
    username = "u2efd59ce569505c1-zone-custom-session-LvnIoYDJ2-sessTime-1"
    password = "u2efd59ce569505c1"
    proxy_dns = "43.153.237.55:2334"
    proxy = {
        "https": "http://{}:{}@{}".format(username, password, proxy_dns),
        "http": "http://{}:{}@{}".format(username, password, proxy_dns)
    }
    response = requests.post(
        request_url,
        proxies=proxy
    )
    print(response.content)
    if response.status_code != 200:
        print(
            f"Lỗi HTTP {response.status_code} khi truy vấn pattern {pattern}, response = {(response.content[:100]) if (len(response.content) > 100) else response.content}")
        return None
    # Trích xuất JSON từ response
    response_data = response.json()

    return response_data


def save_to_file(pattern, numbers):
    if len(numbers) == 0:
        return
    try:
        with open(OUTPUT_FILE, "a") as f:
            for number in numbers:
                f.write(number + ", " + pattern + "\n")
        # print(f"Saved to file: {len(numbers)} numbers")
    except Exception as e:
        print(f"Lỗi khi lưu file: {e}")


def crawl_pattern(pattern):
    print(f"Pattern: {pattern}")
    if not is_valid_input(pattern):
        if is_valid_input(pattern.replace('?', str(9), 1)):
            for i in range(10):
                if "?" in pattern:
                    sub_pattern = pattern.replace('?', str(i), 1)
                    crawl_pattern(sub_pattern)
        return
    response = query_server(pattern)
    time.sleep(2)
    if not response or response.get("errorCode") != 0:
        print(f"Lỗi khi truy vấn pattern {pattern}: {response}")
        if response.get("errorCode") == 1:
            raise ValueError("Limit rate")
        else:
            print(f"Unk error: {response.get('message', '')}")
            return
    data = response.get("data", [])
    numbers = [item["isdn"] for item in data]
    print(f"{len(numbers)} numbers")

    if 20 > len(numbers):
        numbers.sort()
        save_to_file(pattern, numbers)
        return

    for i in range(10):
        sub_pattern = pattern.replace('?', str(i), 1)

        crawl_pattern(sub_pattern)


if __name__ == '__main__':
    crawl_pattern("03????????")
