import asyncio
import enum

import httpx


class Region(enum.Enum):
    EU = "https://eu.example"
    US = "https://us.example"


async def worker(client: httpx.AsyncClient, queue: asyncio.Queue):
    url = await queue.get()
    await client.get(url, timeout=5)


async def drain(client: httpx.AsyncClient, queue: asyncio.Queue, workers: int):
    tasks = [asyncio.create_task(worker(client, queue)) for _ in range(workers)]
    await asyncio.gather(*tasks)


async def drain_configured(client: httpx.AsyncClient, queue: asyncio.Queue, settings):
    await asyncio.gather(*(worker(client, queue) for _ in range(settings.workers)))


async def regions(client: httpx.AsyncClient):
    return await asyncio.gather(*(client.get(r.value, timeout=5) for r in Region))


async def guarded(client: httpx.AsyncClient, permits: asyncio.Semaphore, url):
    async with permits:
        return await client.get(url, timeout=5)


async def with_permits(client: httpx.AsyncClient, urls):
    permits = asyncio.Semaphore(8)
    return await asyncio.gather(*(guarded(client, permits, url) for url in urls))


async def unannotated(client: httpx.AsyncClient, permits, url):
    async with permits:
        return await client.get(url, timeout=5)


async def with_passed_permits(client: httpx.AsyncClient, urls):
    permits = asyncio.BoundedSemaphore(8)
    return await asyncio.gather(*(unannotated(client, permits, url) for url in urls))
