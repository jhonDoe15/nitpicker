from shop.model import Account, Catalog, Context, Order, Receipt, Status


def charge(order: Order) -> Receipt:
    return Receipt(order.total * 2)


def label(status: Status):
    if status in (Status.OPEN, Status.PAID):
        return "live"
    elif status == Status.VOID:
        return "dead"
    return "unknown"


def ship(street: str, city: str, zip_code: str):
    return street + city + zip_code


def bill(street: str, city: str, zip_code: str):
    return street + city + zip_code


def fee(account: Account):
    if account.tier == "gold" and account.balance > 0:
        return 0
    return 1


def audit(ctx: Context):
    return ctx.log


def reprice(catalog: Catalog):
    catalog.set_price("a", 1)
    return catalog.price_of("a")
