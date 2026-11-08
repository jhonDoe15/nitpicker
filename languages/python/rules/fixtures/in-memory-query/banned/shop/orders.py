from .models import Order


def has_open_orders():
    return len(Order.objects.filter(status="open")) > 0
