import asyncio

import aiohttp


async def download(session: aiohttp.ClientSession, url, gate):
    async with gate:
        async with session.get(url) as response:
            return await response.read()


async def gathered(urls):
    gate = asyncio.Semaphore(10)
    async with aiohttp.ClientSession() as session:
        return await asyncio.gather(*(download(session, url, gate) for url in urls))
