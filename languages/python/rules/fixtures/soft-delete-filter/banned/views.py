from shop.models import Order


def open_orders():
    return Order.objects.filter(deleted_at__isnull=True)


def big_orders():
    return list(Order.objects.filter(deleted_at__isnull=True, total__gt=100))


def order_count():
    return Order.objects.filter(deleted_at__isnull=True).count()


def first_order():
    return Order.objects.filter(deleted_at=None).first()


def order_by_id(order_id):
    return Order.objects.exclude(deleted_at__isnull=False).get(pk=order_id)


def total_orders():
    return Order.objects.filter(total__gt=0).count()
