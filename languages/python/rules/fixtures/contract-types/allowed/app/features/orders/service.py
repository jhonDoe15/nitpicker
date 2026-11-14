from dataclasses import dataclass


@dataclass(frozen=True)
class PlacedOrder:
    sku: str


def place_order(sku: str) -> PlacedOrder:
    return PlacedOrder(sku=sku)
