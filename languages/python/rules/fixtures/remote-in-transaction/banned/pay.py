import requests
from django.db import transaction


def pay(order):
    with transaction.atomic():
        order.save()
        requests.post("https://pay.example.com/charges", json={"id": order.id}, timeout=10)
