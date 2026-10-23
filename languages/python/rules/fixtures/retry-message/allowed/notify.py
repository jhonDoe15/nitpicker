from celery import shared_task
from tenacity import retry


@shared_task
def send_receipt(order_id: int) -> int:
    return order_id


@retry
def notify(order_id: int) -> None:
    send_receipt.apply_async((order_id,), task_id=f"receipt-{order_id}")
