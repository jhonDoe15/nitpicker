from dataclasses import dataclass


@dataclass(frozen=True)
class Order:
    identifier: str
    quantity: int
