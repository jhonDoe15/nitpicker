from shop import billing
from shop.model import Account, Catalog, Context, Order, Receipt, Status


def process(order: Order) -> Receipt:
    return billing.charge(order)


def badge(status: Status):
    if status == Status.OPEN or status == Status.PAID:
        return 1
    elif status == Status.VOID:
        return 2
    return 0


def deliver(street: str, city: str, zip_code: str):
    return street + city + zip_code


def discount(account: Account):
    if account.tier == "silver" or account.balance < 10:
        return 5
    return 0


def place(ctx: Context):
    billing.audit(ctx)
    return ctx.db


def stock(catalog: Catalog):
    catalog.add_item("a")
    return catalog.list_items()
