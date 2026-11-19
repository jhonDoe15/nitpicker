import ast

from checks.common import dotted_name
from effect_kinds.specs import STORE_CLIENTS

DJANGO_CACHES = {"django.core.cache.cache", "django.core.cache.caches"}
DJANGO_WRITES = {
    "set",
    "add",
    "delete",
    "set_many",
    "delete_many",
    "incr",
    "decr",
    "touch",
    "clear",
    "get_or_set",
    "incr_version",
    "decr_version",
}
REDIS_WRITES = {
    "set",
    "setex",
    "setnx",
    "delete",
    "unlink",
    "hset",
    "hmset",
    "hdel",
    "mset",
    "expire",
    "pexpire",
    "incr",
    "incrby",
    "decr",
    "decrby",
    "lpush",
    "rpush",
    "sadd",
    "srem",
    "zadd",
    "zrem",
}
REDIS_FACTORIES = {name for name in STORE_CLIENTS if name.startswith("redis.")} | {
    "redis.StrictRedis",
    "redis.asyncio.StrictRedis",
    "redis.cluster.RedisCluster",
    "django_redis.get_redis_connection",
}


def root_of(node):
    while isinstance(node, (ast.Attribute, ast.Subscript, ast.Call)):
        node = node.func if isinstance(node, ast.Call) else node.value
    return node if isinstance(node, ast.Name) else None


def client_names(context):
    def build(_):
        found = set()
        for node in ast.walk(context.tree):
            if not isinstance(node, (ast.Assign, ast.AnnAssign)) or node.value is None:
                continue
            value = node.value
            value = value.value if isinstance(value, ast.Await) else value
            factory = (
                dotted_name(value.func, context.aliases)
                if isinstance(value, ast.Call)
                else None
            )
            if factory in REDIS_FACTORIES:
                targets = (
                    node.targets if isinstance(node, ast.Assign) else [node.target]
                )
                found.update(
                    t.id if isinstance(t, ast.Name) else t.attr
                    for t in targets
                    if isinstance(t, (ast.Name, ast.Attribute))
                )
        return found

    return context.project.memo(("cache-clients", context.path), build)


def cache_label(call, context):
    function = call.func
    if not isinstance(function, ast.Attribute):
        return None
    owner = function.value
    root = root_of(owner)
    if root is None:
        return None
    dotted = dotted_name(
        owner.value if isinstance(owner, ast.Subscript) else owner, context.aliases
    )
    if dotted in DJANGO_CACHES:
        return function.attr if function.attr in DJANGO_WRITES else None
    named = owner.attr if isinstance(owner, ast.Attribute) else root.id
    known = {named, root.id} & client_names(context)
    return function.attr if known and function.attr in REDIS_WRITES else None
