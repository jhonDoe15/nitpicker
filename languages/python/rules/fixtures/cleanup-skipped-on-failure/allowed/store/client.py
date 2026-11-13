import asyncio
from contextlib import AsyncExitStack

import pytest


class Client:
    def __init__(self, producer, consumer):
        self.producer = producer
        self.consumer = consumer
        self.started = True

    async def aclose(self):
        async with AsyncExitStack() as stack:
            stack.callback(self.reset)
            stack.push_async_callback(self.consumer.aclose)
            stack.push_async_callback(self.producer.aclose)

    def reset(self):
        self.started = False

    def close(self):
        try:
            self.producer.close()
        finally:
            self.consumer = None

    async def shutdown(self):
        await asyncio.gather(
            self.producer.aclose(), self.consumer.aclose(), return_exceptions=True
        )

    async def start(self):
        await self.producer.aclose()
        await self.consumer.aclose()


@pytest.fixture
async def client(make_producer, make_consumer):
    producer = make_producer()
    consumer = make_consumer()
    yield producer, consumer
    try:
        await producer.aclose()
    finally:
        await consumer.aclose()
