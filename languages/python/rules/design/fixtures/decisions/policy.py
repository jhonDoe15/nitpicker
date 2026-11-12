from dataclasses import dataclass
from enum import Enum
from typing import Literal

Mode = Literal["fast", "slow", "off"]


class Status(Enum):
    OPEN = 1
    PAID = 2
    VOID = 3


@dataclass
class Order:
    status: Status
    kind: str
    priority: int
    note: str
    flag: bool


def match_enum(status: Status):
    match status:
        case Status.OPEN | Status.PAID:
            return 1
        case Status.VOID:
            return 2
        case _:
            return 3


def match_literal(mode: Mode):
    match mode:
        case "fast":
            return 1
        case "slow" | "off":
            return 2


def match_guarded(status: Status):
    match status:
        case Status.OPEN if status.value > 0:
            return 1
        case _:
            return 2


def match_capture(status: Status):
    match status:
        case Status.OPEN:
            return 1
        case [first, *rest]:
            return 2


def match_field(order: Order):
    match order.kind:
        case "a":
            return 1
        case "b":
            return 2


def chain_equality(status: Status):
    if status == Status.OPEN or status == Status.PAID:
        return 1
    elif status is Status.VOID:
        return 2
    else:
        return 3


def chain_reversed(status: Status):
    if Status.OPEN == status:
        return 1
    elif status in (Status.PAID, Status.VOID):
        return 2


def chain_literal(mode: Mode):
    if mode == "fast":
        return 1
    elif mode in {"slow", "off"}:
        return 2
    return 3


def chain_other_subject(status: Status, mode: Mode):
    if status == Status.OPEN:
        return 1
    elif mode == "fast":
        return 2
    else:
        return 3


def chain_single(status: Status):
    if status in (Status.OPEN, Status.PAID):
        return 1


def chain_field(order: Order):
    if order.kind == "a":
        return 1
    elif order.kind in ("b", "c"):
        return 2
    else:
        return 3


def chain_field_values(order: Order):
    if order.priority == 1 or order.priority == 2:
        return 1
    elif order.priority == 3:
        return 2


def chain_nested(status: Status, order: Order):
    if status == Status.OPEN:
        if order.kind == "a":
            return 1
    return 0


def not_decisions(status: Status, other, order: Order, mode: Mode):
    if status != Status.OPEN:
        return 1
    if status == other:
        return 2
    if status is None:
        return 3
    if other == "x":
        return 4
    if order.note == "x":
        return 5
    if order.flag:
        return 6
    if status == Status.OPEN and mode == "fast":
        return 7
    return 8


def field_through_self(order: Order, mode: Mode):
    return 1 if mode == "fast" else 2
