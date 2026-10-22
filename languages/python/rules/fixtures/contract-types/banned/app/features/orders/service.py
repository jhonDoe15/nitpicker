from sqlalchemy.orm import Session


def place_order(session: Session, sku: str) -> int:
    return len(sku)
