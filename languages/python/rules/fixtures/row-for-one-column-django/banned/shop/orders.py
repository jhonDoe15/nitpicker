from .models import Order


def statuses():
    return [order.status for order in Order.objects.filter(status="open")]
