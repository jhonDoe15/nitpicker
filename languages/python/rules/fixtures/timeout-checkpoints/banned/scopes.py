import asyncio
import threading
from concurrent.futures import Future

import requests
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


async def imported_client_get(flag):
    with trio.fail_after(5):
        if flag:
            await trio.sleep(0)
        else:
            requests.get("https://example.com", timeout=5)


async def future_result(flag, future: Future):
    with trio.fail_after(5):
        if flag:
            await trio.sleep(0)
        else:
            future.result()


async def thread_join(flag, thread: threading.Thread):
    with trio.fail_after(5):
        if flag:
            await trio.sleep(0)
        else:
            thread.join()


async def yield_is_not_a_checkpoint(flag):
    with trio.fail_after(5):
        if flag:
            yield render()
        else:
            await fetch()
