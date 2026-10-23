import asyncio


async def run(operation):
    try:
        await operation()
    except asyncio.CancelledError as error:
        return str(error)
