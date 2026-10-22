import httpx
import requests


def fetch(url: str) -> None:
    requests.get(url, timeout=10)
    httpx.get(url, timeout=10)
    httpx.get(url)
