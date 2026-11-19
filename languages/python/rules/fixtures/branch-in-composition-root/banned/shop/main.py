import os

from shop.stores import MemoryStore, RedisStore


def build():
    if os.environ.get("STORE") == "redis":
        return RedisStore()
    return MemoryStore()
