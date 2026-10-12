from pydantic import BaseModel


class Order(BaseModel):
    identifier: str
    quantity: int
