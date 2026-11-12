import asyncio

import boto3


async def read_one(table, key):
    return table.get_item(Key={"id": key})


async def read_all(keys):
    table = boto3.client("dynamodb")
    return await asyncio.gather(*(read_one(table, key) for key in keys))
