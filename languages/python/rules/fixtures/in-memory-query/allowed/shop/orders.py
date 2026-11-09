from .models import Order


def has_open_orders():
    return Order.objects.filter(status="open").exists()
