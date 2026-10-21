import asyncio as aio
import datetime as dt
import logging
import subprocess

logger = logging.getLogger(__name__)


async def load(client, url):
    async with aio.timeout(1):
        return await client.get(url)


def timestamp():
    return dt.datetime.now(tz=dt.timezone.utc)


def diagnose():
    logger.error("No active exception")
    logger.info("%s %s", "one", "two")


def command():
    subprocess.run(["git", "status"], check=True)


def fail():
    raise ValueError("Raised")
