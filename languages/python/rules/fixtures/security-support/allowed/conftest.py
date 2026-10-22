import requests


def probe(url):
    return requests.get(url, verify=False, timeout=10)
