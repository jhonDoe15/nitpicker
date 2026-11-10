import time


def is_expired(payload: dict[str, int]) -> bool:
    return payload["exp"] < time.time() * 1000
