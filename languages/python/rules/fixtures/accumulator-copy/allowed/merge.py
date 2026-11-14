import itertools


def flatten(groups: list[list[int]]) -> list[int]:
    return list(itertools.chain.from_iterable(groups))


def first_match(items: list[int]) -> list[int]:
    found: list[int] = []
    for item in items:
        if item:
            found = [*found, item]
            break
    return found


def names() -> list[str]:
    acc: list[str] = []
    for name in ("a", "b", "c"):
        acc = acc + [name]
    return acc
