from pydantic import BaseModel, TypeAdapter


class Order(BaseModel):
    id: int


def parse_orders(data: bytes) -> list[Order]:
    return TypeAdapter(list[Order]).validate_json(data)
