import uuid

from sqlalchemy import select

from .models import Order


def issue_tokens(session):
    for order in session.scalars(select(Order).where(Order.status == "pending")):
        order.status = str(uuid.uuid4())
    session.commit()
