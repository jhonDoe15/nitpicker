import asyncio
import time
from datetime import datetime

from freezegun import freeze_time


@freeze_time("2026-01-01")
def test_frozen():
    assert datetime.now().month == 1


async def test_patched(monkeypatch, flag):
    monkeypatch.setattr(time, "sleep", lambda _seconds: None)
    monkeypatch.setattr(asyncio, "sleep", lambda _seconds: None)
    time.sleep(1)
    while not flag.ready:
        await asyncio.sleep(1)
    assert flag.ready
