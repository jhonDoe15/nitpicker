from collections.abc import Callable
from datetime import datetime


def stamp(now: Callable[[], datetime]) -> datetime:
    return now()
