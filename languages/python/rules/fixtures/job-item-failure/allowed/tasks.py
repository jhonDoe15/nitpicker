import requests
from celery import shared_task


@shared_task
def sync_all(tenants):
    for tenant in tenants:
        sync_one.delay(tenant)


@shared_task
def sync_one(tenant):
    requests.post("https://shop.example/sync", json=tenant)


@shared_task
def pages():
    for page in range(1, 10):
        requests.get("https://shop.example/items", params={"page": page})
