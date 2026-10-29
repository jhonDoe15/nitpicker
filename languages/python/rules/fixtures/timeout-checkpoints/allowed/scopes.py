import asyncio
import trio
import anyio


async def suspends():
    await asyncio.sleep(0)
    return render()


async def every_branch(flag):
    async with asyncio.timeout(5):
        if flag:
            await fetch()
        else:
            await cache_fetch()


async def early_return_without_work(cache, key):
    with trio.fail_after(5):
        if key in cache:
            return cache.get(key)
        return await fetch()


async def async_for(stream):
    with trio.move_on_after(5):
        async for chunk in stream:
            handle(chunk)


async def loop_that_always_runs():
    with trio.move_on_after(5):
        while True:
            await trio.sleep(1)
            work()


async def else_checkpoint():
    with trio.move_on_after(5):
        try:
            work()
        except ValueError:
            raise
        else:
            await cleanup()


async def handler_after_checkpoint():
    async with asyncio.timeout(5):
        try:
            await fetch()
        except ValueError as error:
            logger.warning("bad value")
            raise RuntimeError("bad value") from error


async def shielded_cleanup():
    with anyio.CancelScope(shield=True):
        if flag:
            await close()
        else:
            release()


async def cheap_branch(flag):
    async with asyncio.timeout(5):
        if flag:
            await fetch()
        else:
            logger.info("skipped")


async def wait_for_a_coroutine_that_suspends():
    await asyncio.wait_for(suspends(), 3)


async def no_checkpoint_at_all():
    async with asyncio.timeout(5):
        work()
