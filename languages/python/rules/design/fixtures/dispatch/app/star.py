from app.model import *


def use() -> int:
    Factory.build()
    handler = Handler()
    return handler(1)
