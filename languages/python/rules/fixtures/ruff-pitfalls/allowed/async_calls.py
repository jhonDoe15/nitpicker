import asyncio

import httpx


async def fetch(client, url):
    return await client.get(url)


async def load(url):
    async with httpx.AsyncClient() as client, asyncio.timeout(5):
        return await fetch(client, url)


async def wait_ready(ready):
    await ready.wait()


async def nap():
    await asyncio.sleep(1)


async def spawn():
    process = await asyncio.create_subprocess_exec("git", "status")
    return await process.wait()


async def read(path):
    return await asyncio.to_thread(path.read_text, encoding="utf-8")
