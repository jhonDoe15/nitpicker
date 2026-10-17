import httpx
import requests


def fetch(url):
    requests.get(url)
    httpx.get(url)
