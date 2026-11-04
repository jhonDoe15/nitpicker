from dataclasses import dataclass
from enum import Enum


class Color(Enum):
    RED = 1


@dataclass
class Ctx:
    clock: object
    db: object
    log: object
    user: str
    flags: list


class Service:
    def handle(self, first, ctx: Ctx):
        return ctx.db


def inner(ctx: Ctx):
    return ctx.db


def inner_keyword(count, ctx: Ctx):
    return ctx.log


def takes_one(ctx):
    return ctx


def takes_star(*items):
    return items


def reads_fields(ctx: Ctx):
    return ctx.clock.now() + ctx.user


def forwards_whole(ctx: Ctx):
    inner(ctx)
    inner_keyword(1, ctx=ctx)


def forwards_to_method(ctx: Ctx, service: Service):
    service.handle(1, ctx)


def unused(ctx: Ctx, name: str, color: Color):
    return name


def none_check(ctx: Ctx):
    if ctx is None:
        return 0
    return ctx.user


def returned(ctx: Ctx):
    return ctx


def stored(ctx: Ctx, holder: list):
    holder.append(ctx)


def captured(ctx: Ctx):
    def later():
        return ctx.db

    return later


def lambda_capture(ctx: Ctx):
    return lambda: ctx.user


def reassigned(ctx: Ctx):
    ctx = Ctx(1, 2, 3, "u", [])
    return ctx.user


def unresolved_callee(ctx: Ctx):
    external(ctx)


def undeclared_position(ctx: Ctx):
    takes_one(1, ctx)


def variadic_position(ctx: Ctx):
    takes_star(ctx)


def starred(ctx: Ctx):
    takes_one(*ctx)


def dunder(ctx: Ctx):
    return ctx.__dict__


def dynamic(ctx: Ctx):
    return getattr(ctx, "user")


def spread(ctx: Ctx):
    return {**ctx}


def mixed(ctx: Ctx):
    inner(ctx)
    return ctx.user


def repeated(ctx: Ctx):
    inner(ctx)
    inner(ctx)
    return ctx.user + ctx.user


def shadowed(ctx: Ctx):
    return lambda ctx: ctx.user
