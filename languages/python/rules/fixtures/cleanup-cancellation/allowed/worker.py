import trio


async def run(resource, work):
    try:
        await work()
    finally:
        with trio.move_on_after(5, shield=True):
            await resource.aclose()
