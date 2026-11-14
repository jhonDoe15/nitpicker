import requests


def fetch(urls):
    return [requests.get(url, timeout=10) for url in urls]
