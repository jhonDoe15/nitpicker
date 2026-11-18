import secrets

from .models import Order


def issue_tokens():
    rows = list(Order.objects.filter(status="pending"))
    for order in rows:
        order.status = secrets.token_hex(8)
    Order.objects.bulk_update(rows, ["status"])
