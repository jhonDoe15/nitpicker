from dataclasses import dataclass


@dataclass(frozen=True)
class Total:
    amount: int
    count: int


def total(prices: list[int]) -> Total:
    return Total(sum(prices), len(prices))
