def batch_iterate(size, items):
    if size is None or size <= 0:
        return [list(items)]
    return chunk(items, size)


async def abatch_iterate(size, items):
    if size is None or size <= 0:
        return [list(items)]
    return chunk(items, size)
