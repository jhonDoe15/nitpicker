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
        self._fail_pending(ConnectionError("closed"))
        await self._transport.close()

    def _fail_pending(self, error):
        for future in self._pending.values():
            if not future.done():
                future.set_exception(error)
        self._pending.clear()


class Reasons:
    def __init__(self):
        self._reasons = {}

    def note(self, key, reason):
        self._reasons[key] = reason

    def close(self):
        self._reasons.clear()
