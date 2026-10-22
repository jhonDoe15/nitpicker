from sqlalchemy.orm import Session


def save_order(session: Session, sku: str) -> None:
    session.info["sku"] = sku
