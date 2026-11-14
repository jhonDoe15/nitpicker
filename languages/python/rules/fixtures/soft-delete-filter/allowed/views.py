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


def trashed_orders():
    return Order.objects.filter(deleted_at__isnull=False)


def restore_orders():
    return Order.objects.filter(total__gt=0).update(deleted_at=None)


ACTIVE = {"deleted_at": None}


def comprehension_filtered(customer):
    return [o for o in Order.objects.filter(customer=customer) if o.deleted_at is None]


def loop_guarded(customer):
    for order in Order.objects.filter(customer=customer):
        if order.deleted_at:
            continue
        print(order)


def predicate_filtered(customer):
    rows = Order.objects.filter(customer=customer)
    return list(filter(lambda o: not o.deleted_at, rows))


def constant_filtered():
    return Order.objects.filter(**ACTIVE)
