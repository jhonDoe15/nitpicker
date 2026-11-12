import trio


async def pause():
    trio.sleep(1)
    await trio.sleep(0)
    await trio.sleep(86401)
