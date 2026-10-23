import ast

from checks.common import dotted_name
from effects.tables import MESSAGE, UNSAFE_MESSAGE, UNSAFE_STRIPE
from security.resolve.scopes import values_of, where_of

STRIPE_RESOURCES = {
    "payment_intents",
    "charges",
    "customers",
    "refunds",
    "payouts",
    "transfers",
    "subscriptions",
    "invoices",
    "sessions",
    "payment_links",
    "setup_intents",
}
DEDUPLICATION = {"messagededuplicationid", "message_id", "task_id"}
IDEMPOTENCY = {"idempotency_key", "idempotencykey"}


def named(node, names):
    if isinstance(node, ast.keyword) and (node.arg or "").lower() in names:
        return True
    return isinstance(node, ast.Constant) and str(node.value).lower() in names


def bound_values(call, site, context):
    where = where_of(site, context)
    arguments = [*call.args, *(k.value for k in call.keywords)]
    return [
        value
        for argument in arguments
        if isinstance(argument, ast.Name)
        for value, _ in values_of(argument.id, where)
    ]


def mentions(call, names, site, context):
    nodes = [call, *bound_values(call, site, context)]
    return any(named(node, names) for root in nodes for node in ast.walk(root))


def is_stripe_create(call, names, aliases, imports_stripe):
    if not imports_stripe or names[-1] != "create":
        return False
    dotted = dotted_name(call.func, aliases) or ""
    return dotted.startswith("stripe.") or bool(set(names[:-1]) & STRIPE_RESOURCES)


def unsafe_tags(call, names, kind, facts, text):
    site, context, imports_stripe = facts
    if kind == MESSAGE and not mentions(call, DEDUPLICATION, site, context):
        return {UNSAFE_MESSAGE: (text,)}
    if is_stripe_create(call, names, context.aliases, imports_stripe):
        if mentions(call, IDEMPOTENCY, site, context):
            return {}
        return {UNSAFE_STRIPE: (text,)}
    return {}
