import asyncio

import httpx
from app.db import session


async def indexed(client: httpx.AsyncClient, urls):
    return await asyncio.gather(*(client.get(urls[i], timeout=5) for i in range(len(urls))))


async def in_session(client: httpx.AsyncClient, url):
    async with session:
        return await client.get(url, timeout=5)


async def sessions(client: httpx.AsyncClient, urls):
    return await asyncio.gather(*(in_session(client, url) for url in urls))


async def in_pool(client: httpx.AsyncClient, pool, url):
    async with pool.acquire():
        return await client.get(url, timeout=5)


async def pooled(client: httpx.AsyncClient, pool, urls):
    return await asyncio.gather(*(in_pool(client, pool, url) for url in urls))
