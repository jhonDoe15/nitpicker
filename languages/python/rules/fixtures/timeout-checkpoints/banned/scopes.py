import asyncio
import trio
from trio import fail_after as bounded


async def quiet():
    return render()


async def conditional(flag):
    async with asyncio.timeout(5):
        if flag:
            render()
        else:
            await fetch()


async def after_loop(items):
    with trio.fail_after(5):
        for item in items:
            await send(item)
        finish()


async def aliased(flag):
    with bounded(3):
        if flag:
            await trio.sleep(0)
        else:
            blocking()


async def awaits_a_coroutine_that_never_suspends():
    with trio.move_on_after(2):
        await quiet()


async def handler_path():
    with trio.move_on_after(2):
        try:
            risky()
        except ValueError:
            recover()
        if flag:
            await trio.sleep(0)


async def wait_for_a_coroutine_that_never_suspends():
    await asyncio.wait_for(quiet(), 3)
