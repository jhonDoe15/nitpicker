import app.features.billing.internal.tax as tax
from app.features.billing import invoice
from app.features.shipping.api import ship
from app.shared.ids import new_id


class Cart:
    total = 0


def place_order(amount: int) -> str:
    return f"{new_id()} {amount + tax.tax()} {ship()} {invoice.Invoice}"
