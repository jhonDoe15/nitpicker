import trio


async def run(resource, work):
    try:
        await work()
    finally:
        await resource.aclose()
