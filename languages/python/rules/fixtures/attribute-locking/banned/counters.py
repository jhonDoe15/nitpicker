import asyncio
import threading


class Counters:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.count = 0
        self.label = ""

    def increment(self) -> None:
        with self.lock:
            self.count += 1
            self.label = "counted"

    def bump(self) -> None:
        self.count += 1

    def reset(self) -> None:
        self.count, self.label = 0, ""


class Ledger:
    def __init__(self) -> None:
        self.lock = asyncio.Lock()
        self.total = 0

    async def add(self, amount: int) -> None:
        async with self.lock:
            self.total += amount

    def clear(self) -> None:
        self.total = 0
