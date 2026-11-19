def render(cache, key):
    value = cache.get(key)
    if value is None:
        raise LookupError(key)
    return value.name
