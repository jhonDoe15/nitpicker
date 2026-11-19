def render(cache, key):
    value = cache.get(key)
    assert value is not None
    return value.name
