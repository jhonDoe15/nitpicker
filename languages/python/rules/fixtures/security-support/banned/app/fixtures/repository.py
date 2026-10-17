import requests


def schedule(url):
    return requests.get(url, verify=False, timeout=10)
