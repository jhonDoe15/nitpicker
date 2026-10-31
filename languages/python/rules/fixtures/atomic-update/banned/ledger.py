import asyncio
from collections.abc import Awaitable, Callable


class Ledger:
    def __init__(self) -> None:
        self.total = 0

    async def add(self, fetch: Callable[[], Awaitable[int]]) -> None:
        self.total += await fetch()

    async def add_under_fresh_lock(self, fetch: Callable[[], Awaitable[int]]) -> None:
        lock = asyncio.Lock()
        async with lock:
            self.total += await fetch()

    async def add_from_saved(self, fetch: Callable[[], Awaitable[int]]) -> None:
        current = self.total
        current += await fetch()
        self.total = current
