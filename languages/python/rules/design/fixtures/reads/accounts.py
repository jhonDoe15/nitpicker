from dataclasses import dataclass


@dataclass
class Customer:
    name: str
    tier: str
    balance: int

    @property
    def active(self):
        return self.balance > 0

    def greet(self):
        return self.name


class Account:
    def __init__(self, owner: Customer):
        self.owner = owner
        self.limit = 10

    def label(self):
        if self.owner.tier == "gold":
            return self.owner.name
        return "plain"

    def compare(self, other: "Account"):
        return other.limit - self.limit


def local_value():
    customer = Customer("a", "gold", 0)
    total = customer.balance + 1
    return customer.tier if customer.name else total


def parameter_value(customer: Customer, count: int):
    if customer.active and count > 0:
        return customer.greet()
    while customer.balance > count:
        count += 1
    return [customer.name for _ in range(count) if customer.tier]


def alias_value(customer: Customer):
    same = customer
    return same.name + customer.tier


def untyped_value(customer):
    return customer.name


def shadowed_value(customer: Customer):
    customer = customer.name
    return customer.upper()
