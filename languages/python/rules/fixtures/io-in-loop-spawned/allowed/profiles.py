import anyio

from shop.db import session


async def load_all(user_ids):
    return await session.scalars(Profile.select_in(user_ids))


async def load_profile(queue):
    return await queue.receive()


async def drain(queue):
    async with anyio.create_task_group() as group:
        for _ in range(4):
            group.start_soon(load_profile, queue)
