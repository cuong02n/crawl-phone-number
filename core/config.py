import json
import os

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
CONFIG_PATH = os.path.join(ROOT_DIR, "config.json")


def load_config() -> dict:
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r") as f:
            return json.load(f)
    return {"proxy_dns": "", "username": "", "password": ""}


def save_config(data: dict):
    with open(CONFIG_PATH, "w") as f:
        json.dump(data, f, indent=2)


def build_proxies(config: dict) -> dict | None:
    proxy_dns = config.get("proxy_dns", "").strip()
    if not proxy_dns:
        return None
    username = config.get("username", "").strip()
    password = config.get("password", "").strip()
    url = f"http://{username}:{password}@{proxy_dns}" if username else f"http://{proxy_dns}"
    return {"http": url, "https": url}
