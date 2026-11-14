import threading

import requests

LOCK = threading.Lock()


def refresh():
    with LOCK:
        return requests.get("https://config.example.com", timeout=10)
