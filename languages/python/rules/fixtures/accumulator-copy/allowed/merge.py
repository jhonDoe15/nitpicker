import itertools


def flatten(groups: list[list[int]]) -> list[int]:
    return list(itertools.chain.from_iterable(groups))
