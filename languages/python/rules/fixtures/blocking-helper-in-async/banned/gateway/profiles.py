import requests

PROFILE_SECONDS = 5


def fetch_profile(url: str) -> dict[str, str]:
    return requests.get(url, timeout=PROFILE_SECONDS).json()


async def handler(url: str) -> dict[str, str]:
    return fetch_profile(url)
