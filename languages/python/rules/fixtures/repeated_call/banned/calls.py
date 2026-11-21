import json
from typing import Protocol


class Entry(Protocol):
    enabled: bool


class Resolved(Protocol):
    def is_present(self) -> bool: ...
    def get(self) -> str: ...


class Expr(Protocol):
    args: list["Expr"]


def lookup(key: str) -> Entry | None:
    return None


def resolve(node: object) -> Resolved:
    raise NotImplementedError


def check_and_use(key: str) -> bool:
    return lookup(key) is not None and lookup(key).enabled


def ternary_use(node: object) -> str | None:
    return resolve(node).get() if resolve(node).is_present() else None


def branch_use(key: str) -> bool:
    if lookup(key):
        return lookup(key).enabled
    return False


def parse_twice(text: str) -> object:
    return json.loads(text)["ok"] is True and json.loads(text)["value"]


def node_type(expr: Expr) -> str:
    for argument in expr.args:
        direct = node_type(argument)
        again = node_type(argument)
        if direct != again:
            return direct
    return ""
