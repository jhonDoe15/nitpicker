import asyncio


async def load(ids, repository):
    return await asyncio.gather(*[repository.find_by_id(item) for item in ids])
