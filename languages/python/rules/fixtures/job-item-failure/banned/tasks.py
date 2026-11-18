import requests
from celery import shared_task


@shared_task
def sync_all(tenants):
    for tenant in tenants:
        requests.post("https://shop.example/sync", json=tenant)
