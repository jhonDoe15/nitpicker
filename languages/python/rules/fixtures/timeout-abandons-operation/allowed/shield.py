import asyncio


async def cancelled_after_timeout(work):
    task = asyncio.ensure_future(work())
    try:
        return await asyncio.wait_for(asyncio.shield(task), 5)
    except asyncio.TimeoutError:
        task.cancel()
        raise


async def awaited_later(work):
    task = asyncio.create_task(work())
    try:
        return await asyncio.wait_for(asyncio.shield(task), 5)
    except asyncio.TimeoutError:
        await task
        raise


async def owned_by_caller(task):
    return await asyncio.wait_for(asyncio.shield(task), 5)
