import os


async def read(name):
    with open(name, encoding="utf-8") as handle:
        handle.read()
    return os.path.exists(name)
