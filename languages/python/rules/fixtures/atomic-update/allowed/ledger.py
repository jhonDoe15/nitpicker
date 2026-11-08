import asyncio
from collections import defaultdict
from collections.abc import Awaitable, Callable


class Ledger:
    gate = asyncio.Semaphore(1)

    def __init__(self) -> None:
        self.total = 0
        self.lock = asyncio.Lock()
        self.locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def add(self, fetch: Callable[[], Awaitable[int]]) -> None:
        delta = await fetch()
        self.total += delta

    async def add_serialized(self, fetch: Callable[[], Awaitable[int]]) -> None:
        async with self.lock:
            self.total += await fetch()

    async def add_through_gate(self, fetch: Callable[[], Awaitable[int]]) -> None:
        async with self.gate:
            self.total = self.total + await fetch()

    async def add_per_key(self, key: str, fetch: Callable[[], Awaitable[int]]) -> None:
        async with self.locks[key]:
            self.total += await fetch()


async def count(fetch: Callable[[], Awaitable[int]]) -> int:
    total = 0
    total += await fetch()
    return total
