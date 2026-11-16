import strawberry

from shop.db import session
from shop.models import Customer


@strawberry.type
class Order:
    id: int
    customer_id: int

    @strawberry.field
    async def customer(self) -> "Customer":
        return await session.get(Customer, self.customer_id)


@strawberry.type
class Query:
    @strawberry.field
    async def orders(self) -> list[Order]:
        return await session.scalars(Order.select())
