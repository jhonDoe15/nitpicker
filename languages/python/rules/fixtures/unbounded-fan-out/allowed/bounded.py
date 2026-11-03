import asyncio

import httpx

LIMIT = asyncio.Semaphore(8)
HOSTS = ["https://a.example", "https://b.example"]
CHUNK = 20


async def fetch_one(client: httpx.AsyncClient, url):
    async with LIMIT:
        response = await client.get(url, timeout=5)
        return response.json()


async def fetch_all(urls):
    async with httpx.AsyncClient() as client:
        return await asyncio.gather(*(fetch_one(client, url) for url in urls))


async def fetch_with_local_limit(urls):
    gate = asyncio.Semaphore(8)

    async def worker(client: httpx.AsyncClient, url):
        async with gate:
            return await client.get(url, timeout=5)

    async with httpx.AsyncClient() as client:
        return await asyncio.gather(*(worker(client, url) for url in urls))


async def fetch_hosts(client: httpx.AsyncClient):
    return await asyncio.gather(*(client.get(host, timeout=5) for host in HOSTS))


async def fetch_in_chunks(client: httpx.AsyncClient, urls):
    results = []
    for start in range(0, len(urls), CHUNK):
        chunk = urls[start : start + CHUNK]
        results += await asyncio.gather(*(client.get(url, timeout=5) for url in chunk))
    return results


async def fetch_first_three(client: httpx.AsyncClient, urls):
    return await asyncio.gather(*(client.get(url, timeout=5) for url in urls[:3]))


async def compute(values):
    return await asyncio.gather(*(asyncio.sleep(0, value) for value in values))
