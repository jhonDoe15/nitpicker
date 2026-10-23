from sqlalchemy import text
from sqlalchemy.orm import Session
from tenacity import retry

UPSERT = "INSERT INTO receipts (order_id) VALUES (:order_id) ON CONFLICT DO NOTHING"


@retry
def record(session: Session, order_id: int) -> None:
    session.execute(text(UPSERT), {"order_id": order_id})
