import threading

import requests


class Config:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.value: object = None

    def refresh(self) -> None:
        response = requests.get("https://config.example.com", timeout=10)
        with self._lock:
            self.value = response.json()
