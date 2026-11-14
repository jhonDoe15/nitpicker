from celery import shared_task
from tenacity import retry


@shared_task
def send_receipt(order_id):
    return order_id


@retry
def notify(order_id):
    send_receipt.apply_async((order_id,))
