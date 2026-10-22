import ast
import re

from checks.common import dotted_name, words_of
from effects.tables import MESSAGE, UNSAFE_MESSAGE, UNSAFE_SQL, UNSAFE_STRIPE
from effects.writes import SQL_METHODS, full_text

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
INSERT = re.compile(r"^\s*insert\b", re.I)
UPSERT = re.compile(
    r"on\s+conflict|on\s+duplicate\s+key|insert\s+(?:or\s+)?(?:ignore|replace)|\bmerge\b|replace\s+into",
    re.I,
)
INSERT_CONSTRUCTS = {
    "sqlalchemy.insert",
    "sqlalchemy.dialects.postgresql.insert",
    "sqlalchemy.dialects.mysql.insert",
    "sqlalchemy.dialects.sqlite.insert",
}
UPSERT_METHODS = ("on_conflict", "on_duplicate")
DEDUPLICATION = {"messagededuplicationid"}
IDEMPOTENCY = {"idempotency_key", "idempotencykey"}


def mentions(call, names):
    for node in ast.walk(call):
        if isinstance(node, ast.keyword) and (node.arg or "").lower() in names:
            return True
        if isinstance(node, ast.Constant) and str(node.value).lower() in names:
            return True
    return False


def is_stripe_create(call, names, aliases, imports_stripe):
    if not imports_stripe or names[-1] != "create":
        return False
    dotted = dotted_name(call.func, aliases) or ""
    owners = {word for owner in names[:-1] for word in words_of(owner)}
    return dotted.startswith("stripe.") or bool(owners & STRIPE_RESOURCES)


def insert_construct(node, aliases):
    attributes = []
    while isinstance(node, (ast.Call, ast.Attribute)):
        if isinstance(node, ast.Call):
            if dotted_name(node.func, aliases) in INSERT_CONSTRUCTS:
                return not any(a.startswith(UPSERT_METHODS) for a in attributes)
            node = node.func
        else:
            attributes.append(node.attr)
            node = node.value
    return False


def is_unsafe_insert(call, names, database, aliases):
    if names[-1] not in SQL_METHODS or not database or not call.args:
        return False
    text = full_text(call.args[0])
    if text is not None:
        return bool(INSERT.match(text)) and not UPSERT.search(text)
    return insert_construct(call.args[0], aliases)


def unsafe_tags(call, names, kind, database, context, imports_stripe, text):
    if kind == MESSAGE and not mentions(call, DEDUPLICATION):
        return {UNSAFE_MESSAGE: (text,)}
    if is_stripe_create(call, names, context.aliases, imports_stripe):
        return {} if mentions(call, IDEMPOTENCY) else {UNSAFE_STRIPE: (text,)}
    if is_unsafe_insert(call, names, database, context.aliases):
        return {UNSAFE_SQL: (text,)}
    return {}
