import ast

from checks.common import call_name, finding
from composition.roots import starts_program
from index.clients import BOTO_FACTORIES, HTTP_CLIENT_FACTORIES, REDIS_FACTORIES

RULE = "managed-resource-outside-composition-root"
FACTORIES = (
    HTTP_CLIENT_FACTORIES
    | BOTO_FACTORIES
    | REDIS_FACTORIES
    | {
        "sqlalchemy.create_engine",
        "sqlalchemy.ext.asyncio.create_async_engine",
        "asyncpg.create_pool",
        "redis.Redis.from_url",
        "redis.asyncio.Redis.from_url",
        "redis.asyncio.from_url",
        "celery.Celery",
    }
)


def managed_items(tree):
    return {
        id(item.context_expr)
        for node in ast.walk(tree)
        if isinstance(node, (ast.With, ast.AsyncWith))
        for item in node.items
    }


def check(context):
    if context.tests or starts_program(context):
        return []
    found = []
    scoped = managed_items(context.tree)
    for node in ast.walk(context.tree):
        name = call_name(node, context.aliases)
        if name in FACTORIES and id(node) not in scoped:
            found.append(finding(context.path, RULE, name, node))
    return found
