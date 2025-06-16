import requests
print(requests.get(
    "https://ipv4.webshare.io/",
    proxies={
        "http": "http://rrbrigxf:affxtr7giqm5@198.23.239.134:6540/",
        "https": "http://rrbrigxf:affxtr7giqm5@198.23.239.134:6540/"
    }
).text)