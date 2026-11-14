import asyncio


class Client:
    def __init__(self):
        self._connection = None

    async def connect(self):
        if self._connection is None:
            attempt = asyncio.ensure_future(self._open())
            self._connection = attempt
            try:
                return await attempt
            except Exception:
                if self._connection is attempt:
                    self._connection = None
                raise
        return await self._connection

    async def _open(self):
        return object()
