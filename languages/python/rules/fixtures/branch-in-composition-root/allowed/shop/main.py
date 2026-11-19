import os

from shop.stores import MemoryStore, RedisStore

BACKENDS = {"memory": MemoryStore, "redis": RedisStore}


def build():
    return BACKENDS[os.environ["STORE"]]()


if __name__ == "__main__":
    build()
