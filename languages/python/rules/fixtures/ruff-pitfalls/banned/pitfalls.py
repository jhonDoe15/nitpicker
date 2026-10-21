import asyncio as aio
import datetime as dt
import logging
import pdb
import subprocess

import httpx

logger = logging.Logger(__name__)


async def load(url):
    async with aio.timeout(1):
        return httpx.get(url, timeout=10)


def timestamp():
    return dt.datetime.now()


def diagnose():
    logger.exception("No active exception")
    logger.info("%s %s", "only one")
    pdb.set_trace()


def command():
    subprocess.run(["git", "status"])


def fail():
    ValueError("Not raised")
