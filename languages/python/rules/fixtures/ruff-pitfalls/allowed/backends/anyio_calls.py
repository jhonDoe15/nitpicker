import anyio


async def read(path, command):
    await anyio.lowlevel.checkpoint()
    text = await anyio.Path(path).read_text(encoding="utf-8")
    exists = await anyio.Path(path).exists()
    result = await anyio.run_process(command)
    return text, exists, result


async def bounded(work):
    with anyio.fail_after(5):
        await work()


async def forever():
    await anyio.sleep_forever()
