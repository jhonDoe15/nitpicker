from typing import Optional

import app.core.cart as cart_module
from app import Cart
from app.core import repo as repo_module
from app.core.repo import Repo, SqlRepo
from . import helpers
from .helpers import total as grand_total


class Service:
    store: Repo

    def __init__(self, repo: Repo, other=None):
        self.repo: Repo = repo
        self.cart = Cart("me")
        self.untyped = other
        self.sql = SqlRepo()

    def run(self, key):
        cart = self.cart
        self.repo.save(cart)
        self.untyped.save(cart)
        self.sql.save(cart)
        self.store.load(key)
        self.helper()
        Cart.create("x")
        Cart.blank()
        cart.add(1)
        cart.size
        cart.named().add(2)
        local = cart_module.Cart("y")
        local.add(3)
        helpers.total(1)
        grand_total(2)
        repo_module.Repo().load(key)

    def helper(self):
        return 1

    def maybe(self, cart: Optional[Cart], text: "Cart | None", number: int | None):
        cart.add(1)
        text.add(2)

    async def fetch(self) -> Cart:
        return self.cart


async def use(service: Service):
    cart = await service.fetch()
    cart.add(1)
    pending = service.fetch()
    pending.add(2)


def reassigned(flag):
    value = Cart("a")
    if flag:
        value = repo_module.Repo()
    value.add(1)


def repeated():
    value = Cart("a")
    value = Cart("b")
    value.add(1)


def lazy():
    from app.core.repo import Repo as LocalRepo

    LocalRepo().save(1)


def unknown_calls(items):
    for item in items:
        item.add(1)
    helpers.caller()
