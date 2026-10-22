import urllib.request
from urllib.request import urlopen as open_url

import httpx
import requests


class FeedClient:
    def __init__(self, base_url):
        self.base_url = base_url
        self.session = requests.Session()

    def latest(self):
        return self.session.get(f"{self.base_url}/latest").json()


def download(url):
    with open_url(url) as response:
        return response.read()


def post_all(url, payload):
    with requests.Session() as session:
        return session.post(url, json=payload)


def opener_read(url):
    opener = urllib.request.build_opener()
    return opener.open(url).read()


async def stream(url):
    async with httpx.AsyncClient() as client:
        return await client.get(url, timeout=None)
