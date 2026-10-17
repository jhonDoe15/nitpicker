from pydantic import BaseModel


class Order(BaseModel):
    id: str
    total: int


def parse(text: str) -> Order:
    return Order.model_validate_json(text)
