import asyncio

import httpx


async def fetch(urls: list[str]) -> list[httpx.Response]:
    limit = asyncio.Semaphore(8)
    async with httpx.AsyncClient(timeout=10) as client:

        async def one(url: str) -> httpx.Response:
            async with limit:
                return await client.get(url)

        return await asyncio.gather(*[one(url) for url in urls])
