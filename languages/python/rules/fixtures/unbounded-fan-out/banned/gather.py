import asyncio

import httpx


async def fetch_one(client: httpx.AsyncClient, url):
    response = await client.get(url, timeout=5)
    return response.json()


async def fetch_all(urls):
    async with httpx.AsyncClient() as client:
        return await asyncio.gather(*(fetch_one(client, url) for url in urls))


async def fetch_direct(urls):
    async with httpx.AsyncClient() as client:
        return await asyncio.gather(*[client.get(url, timeout=5) for url in urls])


async def fetch_built(urls):
    async with httpx.AsyncClient() as client:
        tasks = [fetch_one(client, url) for url in urls]
        return await asyncio.gather(*tasks)


async def fetch_appended(urls):
    async with httpx.AsyncClient() as client:
        tasks = []
        for url in urls:
            tasks.append(fetch_one(client, url))
        return await asyncio.gather(*tasks)


async def fetch_mapped(client: httpx.AsyncClient, urls):
    return await asyncio.gather(*map(client.get, urls))
