import threading
import time

import requests


class Tokens:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._token: str | None = None
        self._expires = 0.0

    def token(self) -> str | None:
        with self._lock:
            if self._token is None or self._expires < time.time():
                response = requests.post("https://auth.example.com/token", timeout=5)
                self._token = response.json()["access_token"]
                self._expires = time.time() + 300
            return self._token
