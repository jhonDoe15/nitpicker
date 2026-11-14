from .models import Order


def statuses():
    return list(Order.objects.filter(status="open").values_list("status", flat=True))
