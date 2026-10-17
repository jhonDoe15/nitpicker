import requests


def sync(ids: list[str]) -> object:
    return requests.get("https://example.com/items", params={"ids": ids}, timeout=10)
