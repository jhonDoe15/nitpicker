import asyncio

import boto3


async def publish_one(queue, body):
    return queue.send_message(QueueUrl="https://sqs.example/queue", MessageBody=body)


async def publish_all(bodies):
    queue = boto3.client("sqs")
    return await asyncio.gather(*(publish_one(queue, body) for body in bodies))
