import anyio

from shop.db import session


async def load_profile(user_id):
    return await session.get(Profile, user_id)


async def load_all(user_ids):
    async with anyio.create_task_group() as group:
        for user_id in user_ids:
            group.start_soon(load_profile, user_id)
