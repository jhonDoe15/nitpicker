import asyncio

import aiohttp


async def download(session: aiohttp.ClientSession, url, gate):
    async with gate:
        async with session.get(url) as response:
            return await response.read()


async def group(urls):
    gate = asyncio.Semaphore(10)
    async with aiohttp.ClientSession() as session:
        async with asyncio.TaskGroup() as tg:
            for url in urls:
                tg.create_task(download(session, url, gate))


async def windowed(session: aiohttp.ClientSession, urls, gate):
    pending = []
    for url in urls:
        await gate.acquire()
        pending.append(asyncio.create_task(download(session, url, gate)))
    return await asyncio.gather(*pending)
