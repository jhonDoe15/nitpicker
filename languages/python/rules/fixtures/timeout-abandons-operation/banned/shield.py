import asyncio
from asyncio import shield, wait_for


async def inline(work):
    return await asyncio.wait_for(asyncio.shield(work()), 5)


async def named(work):
    task = asyncio.ensure_future(work())
    return await wait_for(shield(task), 5)


async def annotated(work):
    task: asyncio.Task[str] = asyncio.create_task(work())
    return await asyncio.wait_for(asyncio.shield(task), 5)
