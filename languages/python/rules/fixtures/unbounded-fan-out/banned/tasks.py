import asyncio

import aiohttp
from aiokafka import AIOKafkaProducer


async def download(session: aiohttp.ClientSession, url):
    async with session.get(url) as response:
        return await response.read()


async def group(urls):
    async with aiohttp.ClientSession() as session:
        async with asyncio.TaskGroup() as tg:
            for url in urls:
                tg.create_task(download(session, url))


async def background(urls):
    async with aiohttp.ClientSession() as session:
        return [asyncio.create_task(download(session, url)) for url in urls]


async def publish_all(events):
    producer = AIOKafkaProducer(bootstrap_servers="broker:9092")
    await producer.start()
    await asyncio.gather(*(producer.send("events", event) for event in events))


async def nursery_style(nursery, session: aiohttp.ClientSession, urls):
    for url in urls:
        nursery.start_soon(download, session, url)
