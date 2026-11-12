import asyncio
import asyncio as aio
from asyncio import FIRST_COMPLETED, wait as wait_tasks


async def first_result(tasks):
    done, pending = await asyncio.wait(tasks, timeout=5)
    return done


async def first_finished(tasks):
    done, pending = await aio.wait(tasks, return_when=aio.FIRST_COMPLETED)
    if pending:
        print(len(pending))
    return done


async def first_aliased(tasks):
    done, _ = await wait_tasks(tasks, return_when=FIRST_COMPLETED)
    return done


async def dropped(tasks):
    await asyncio.wait(tasks, timeout=1)


async def logged(logger, tasks):
    done, pending = await asyncio.wait(tasks, timeout=1)
    for task in pending:
        logger.warning("still running %s", task.get_name())
    return done


async def first_failure(tasks):
    done, *rest = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
    return done


async def cleared(tasks):
    done, pending = await asyncio.wait(tasks, timeout=1)
    pending.clear()
    return done
