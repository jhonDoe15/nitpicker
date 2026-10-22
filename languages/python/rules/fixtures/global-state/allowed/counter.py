import functools

COUNTER = 0


def read() -> int:
    return COUNTER


@functools.cache
def load() -> tuple[str, ...]:
    return ("a",)
