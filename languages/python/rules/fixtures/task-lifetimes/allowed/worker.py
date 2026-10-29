import trio


async def serve(stream):
    await stream.receive_some()


async def run(open_stream):
    with open_stream() as stream:
        async with trio.open_nursery() as nursery:
            nursery.start_soon(serve, stream)
