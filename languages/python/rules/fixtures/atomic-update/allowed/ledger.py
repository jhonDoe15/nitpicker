import asyncio
from collections.abc import Awaitable, Callable


class Ledger:
    def __init__(self) -> None:
        self.total = 0
        self.lock = asyncio.Lock()

    async def add(self, fetch: Callable[[], Awaitable[int]]) -> None:
        delta = await fetch()
        self.total += delta

    async def add_serialized(self, fetch: Callable[[], Awaitable[int]]) -> None:
        async with self.lock:
            self.total += await fetch()


async def count(fetch: Callable[[], Awaitable[int]]) -> int:
    total = 0
    total += await fetch()
    return total
