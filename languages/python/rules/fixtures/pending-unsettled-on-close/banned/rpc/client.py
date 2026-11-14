import asyncio


class Client:
    def __init__(self, transport):
        self._transport = transport
        self._pending: dict[str, asyncio.Future] = {}

    async def request(self, key, payload):
        future = asyncio.get_running_loop().create_future()
        self._pending[key] = future
        await self._transport.send(key, payload)
        return await future

    async def aclose(self):
        self._pending.clear()
        await self._transport.close()
