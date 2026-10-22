from collections.abc import Awaitable, Callable


class Ledger:
    def __init__(self) -> None:
        self.total = 0

    async def add(self, fetch: Callable[[], Awaitable[int]]) -> None:
        self.total += await fetch()
