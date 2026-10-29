import trio


async def serve(stream):
    await stream.receive_some()


async def run(open_stream):
    async with trio.open_nursery() as nursery:
        with open_stream() as stream:
            nursery.start_soon(serve, stream)
