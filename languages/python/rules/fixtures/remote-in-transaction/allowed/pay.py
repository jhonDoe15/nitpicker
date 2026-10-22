import requests
from django.db import transaction


def pay(order):
    with transaction.atomic():
        order.save()
        order.outbox.create(kind="charge")
    requests.get("https://pay.example.com/quote", timeout=10)
