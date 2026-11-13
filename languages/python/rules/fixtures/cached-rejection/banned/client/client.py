import asyncio


class Client:
    def __init__(self):
        self._connection = None

    async def connect(self):
        if self._connection is not None:
            return await self._connection
        self._connection = asyncio.ensure_future(self._open())
        return await self._connection

    async def _open(self):
        return object()
