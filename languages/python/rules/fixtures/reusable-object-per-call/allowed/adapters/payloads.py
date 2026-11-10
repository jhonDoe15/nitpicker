from pydantic import BaseModel, TypeAdapter


class Order(BaseModel):
    id: int


ORDERS = TypeAdapter(list[Order])


def parse_orders(data: bytes) -> list[Order]:
    return ORDERS.validate_json(data)
