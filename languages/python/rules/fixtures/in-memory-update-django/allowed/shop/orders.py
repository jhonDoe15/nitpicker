from .models import Order


def expire_pending(cutoff):
    Order.objects.filter(status="pending", created__lt=cutoff).update(status="expired")
