import random
from collections.abc import Callable


def draw(rng: random.Random, new_id: Callable[[], str]) -> tuple[float, str]:
    return rng.random(), new_id()
