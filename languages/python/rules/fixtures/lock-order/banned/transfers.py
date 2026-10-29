import asyncio
import threading
from threading import RLock as Reentrant


class Registry:
    LOCK = threading.Lock()


class Transfers:
    def __init__(self) -> None:
        self.accounts = threading.Lock()
        self.audit = Reentrant()
        self.ledger = asyncio.Lock()
        self.journal = asyncio.Lock()
        self.moved = 0

    def transfer(self) -> None:
        with self.accounts:
            with self.audit:
                self.moved += 1

    def report(self) -> None:
        with self.audit, self.accounts:
            self.moved = 0

    async def post(self) -> None:
        async with self.ledger:
            async with self.journal:
                self.moved += 2

    async def close(self) -> None:
        async with self.journal:
            async with self.ledger:
                self.moved -= 2

    def share(self) -> None:
        with Registry.LOCK:
            with self.audit:
                self.moved += 3
        with self.audit:
            with Registry.LOCK:
                self.moved -= 3
