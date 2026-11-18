from .models import Order


def expire_pending(cutoff):
    stale = list(Order.objects.filter(status="pending", created__lt=cutoff))
    for order in stale:
        order.status = "expired"
    Order.objects.bulk_update(stale, ["status"])
