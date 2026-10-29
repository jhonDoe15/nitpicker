from collections.abc import Callable


def placeholder_name(new_name: Callable[[], str]) -> str:
    return new_name()
