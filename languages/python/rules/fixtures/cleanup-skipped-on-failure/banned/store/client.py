import asyncio

import pytest


class Client:
    def __init__(self, producer, consumer):
        self.producer = producer
        self.consumer = consumer
        self.started = True

    async def aclose(self):
        await self.producer.aclose()
        await self.consumer.aclose()
        self.started = False

    def close(self):
        self.producer.close()
        self.consumer = None

    async def shutdown(self):
        await asyncio.gather(self.producer.aclose(), self.consumer.aclose())


@pytest.fixture
async def client(make_producer, make_consumer):
    producer = make_producer()
    consumer = make_consumer()
    yield producer, consumer
    await producer.aclose()
    await consumer.aclose()
