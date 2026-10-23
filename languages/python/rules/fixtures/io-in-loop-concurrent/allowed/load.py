async def load(ids: list[str], repository: object) -> object:
    return await repository.find_all_by_id(ids)
