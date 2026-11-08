import trio


async def pause(delay):
    await trio.sleep(delay)
    await trio.lowlevel.checkpoint()
    await trio.sleep_forever()


async def bounded(work):
    with trio.fail_after(5):
        await work()
