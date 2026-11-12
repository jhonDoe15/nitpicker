import anyio
import trio


async def trio_scope(work):
    with trio.move_on_after(5):
        await work()


async def anyio_scope(work):
    with anyio.fail_after(5):
        await work()
