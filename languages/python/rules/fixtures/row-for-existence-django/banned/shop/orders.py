from .models import Order


def has_open():
    return Order.objects.filter(status="open").count() > 0
