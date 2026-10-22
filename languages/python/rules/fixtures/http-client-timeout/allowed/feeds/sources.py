import urllib.request

import aiohttp
import httpx
import requests

TIMEOUT_SECONDS = 10


class FeedClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url
        self.session = requests.Session()

    def latest(self) -> object:
        return self.session.get(
            f"{self.base_url}/latest", timeout=TIMEOUT_SECONDS
        ).json()


def download(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=TIMEOUT_SECONDS) as response:
        return response.read()


def fetch(url: str) -> httpx.Response:
    return httpx.get(url)


async def stream(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.get(url)
        return response.content


async def pull(url: str) -> bytes:
    async with aiohttp.ClientSession() as session, session.get(url) as response:
        return await response.read()
