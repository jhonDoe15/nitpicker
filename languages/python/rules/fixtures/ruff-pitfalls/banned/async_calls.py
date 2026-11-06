import asyncio
import os
import subprocess
import time

import httpx


async def fetch(url, timeout=10):
    async with asyncio.timeout(timeout):
        return url


async def load(url):
    async with asyncio.timeout(1):
        return httpx.get(url, timeout=10)


async def stream(url):
    with httpx.Client() as client:
        return client.get(url)


async def poll(flag):
    while not flag.ready:
        await asyncio.sleep(1)


async def nap():
    time.sleep(1)


async def spawn():
    subprocess.run(["git", "status"], check=True)
    os.popen("git status")
    os.waitpid(0, 0)


async def read(name):
    with open(name, encoding="utf-8") as handle:
        handle.read()
    os.path.exists(name)
    return input()
