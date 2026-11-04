import asyncio
import time
from datetime import date, datetime


async def test_waits(flag):
    time.sleep(1)
    while not flag.ready:
        await asyncio.sleep(1)
    today = date.today()
    assert today <= datetime.utcnow().date()
