import strawberry
from strawberry.dataloader import DataLoader
from strawberry.types import Info

from shop.db import session
from shop.models import Customer


async def load_customers(keys: list[int]) -> list[Customer]:
    rows = {row.id: row for row in await session.scalars(Customer.select_in(keys))}
    return [rows[key] for key in keys]


@strawberry.type
class Order:
    id: int
    customer_id: int

    @strawberry.field
    async def customer(self, info: Info) -> "Customer":
        return await info.context.customer_loader.load(self.customer_id)


@strawberry.type
class Account:
    customer_id: int

    @strawberry.field
    async def orders(self) -> list[Order]:
        return await session.scalars(Order.select_for(self.customer_id))


@strawberry.type
class Query:
    @strawberry.field
    async def orders(self) -> list[Order]:
        return await session.scalars(Order.select())

    @strawberry.field
    async def me(self) -> Account:
        return await session.get(Account, 1)


def customer_loader() -> DataLoader:
    return DataLoader(load_fn=load_customers)
