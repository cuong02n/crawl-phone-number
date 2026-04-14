from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import os
import threading

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'config.json')

class ProxyConfig(BaseModel):
    proxy_dns: str
    username: str
    password: str

@app.get("/api/config")
def get_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'r') as f:
            return json.load(f)
    return {"proxy_dns": "", "username": "", "password": ""}

@app.post("/api/config")
def save_config(config: ProxyConfig):
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config.dict(), f, indent=2)
    return {"status": "success"}

import subprocess
import sys

@app.post("/api/crawl/start/{network}")
def start_crawl(network: str, background_tasks: BackgroundTasks):
    base_dir = os.path.dirname(__file__)
    
    if network == "vnpt":
        path = os.path.join(base_dir, "vnpt", "crawl_vnpt.py")
        subprocess.Popen([sys.executable, path], cwd=os.path.join(base_dir, "vnpt"))
    elif network == "viettel":
        for script in ["main_03.py", "main_08.py", "main_09.py"]:
            path = os.path.join(base_dir, "viettel", script)
            subprocess.Popen([sys.executable, path], cwd=os.path.join(base_dir, "viettel"))
            
    return {"status": "success", "message": f"Started {network} crawler"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
