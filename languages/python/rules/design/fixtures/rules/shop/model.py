from dataclasses import dataclass
from enum import Enum


class Status(Enum):
    OPEN = 1
    PAID = 2
    VOID = 3


@dataclass
class Receipt:
    total: int


@dataclass
class Order:
    status: Status
    total: int


@dataclass
class Context:
    db: object
    clock: object
    log: object
    user: str
    locale: str
    flags: list


class Account:
    def __init__(self, tier: str, balance: int):
        self.tier = tier
        self.balance = balance

    def charge(self, amount: int):
        self.balance -= amount


class Catalog:
    def __init__(self):
        self._items = []
        self._prices = {}

    def add_item(self, item):
        self._items.append(item)

    def list_items(self):
        return list(self._items)

    def set_price(self, key, value):
        self._prices[key] = value

    def price_of(self, key):
        return self._prices.get(key)
