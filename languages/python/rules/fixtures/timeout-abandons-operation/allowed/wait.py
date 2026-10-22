import asyncio
import asyncio as aio
from asyncio import wait as wait_tasks


async def cancel_pending(tasks):
    done, pending = await asyncio.wait(tasks, timeout=5)
    for task in pending:
        task.cancel()
    await asyncio.gather(*pending, return_exceptions=True)
    return done


async def cancel_comprehension(tasks):
    done, pending = await aio.wait(tasks, return_when=aio.FIRST_COMPLETED)
    [task.cancel() for task in pending]
    return done


async def hand_off(owner, tasks):
    done, pending = await wait_tasks(tasks, timeout=5)
    owner.background.update(pending)
    return done


async def wait_again(tasks):
    done, pending = await asyncio.wait(tasks, timeout=5)
    await asyncio.wait(pending)
    return done


async def return_pending(tasks):
    return await asyncio.wait(tasks, timeout=5)


async def waits_for_all(tasks):
    done, _ = await asyncio.wait(tasks)
    return done


async def runs_to_completion(tasks):
    done, _ = await asyncio.wait(tasks, return_when=asyncio.ALL_COMPLETED)
    return done


async def cancels_on_timeout(task):
    return await asyncio.wait_for(task, 5)


async def scoped(work):
    async with asyncio.timeout(5):
        return await work()
