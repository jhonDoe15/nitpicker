from django.db import models, transaction


def place(request, data):
    with transaction.atomic():
        order = Order.objects.create(**data)
        Item.objects.create(order=order)


@transaction.atomic
def place_decorated(request, data):
    order = Order.objects.create(**data)
    Item.objects.create(order=order)


def rename(order):
    order.name = "renamed"
    order.save()
    order.name = "final"
    order.save()


def remember(request, order):
    order.save()
    request.session.save()
