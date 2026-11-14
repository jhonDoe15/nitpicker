from sqlalchemy import text
from tenacity import retry


@retry
def record(session, order_id):
    session.execute(text("INSERT INTO receipts (order_id) VALUES (:order_id)"), {"order_id": order_id})
