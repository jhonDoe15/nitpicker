from app.features import orders
from app.features.billing import _rates


def main() -> None:
    orders.place_order(_rates.rate())
