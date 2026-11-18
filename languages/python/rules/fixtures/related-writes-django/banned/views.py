from django.db import models


def place(request, data):
    order = Order.objects.create(**data)
    Item.objects.create(order=order)
