import ast

from checks.common import dotted_name, own_nodes
from security.resolve.calls import keyword, partial_target
from security.resolve.classes import (
    attribute_values,
    bases_of,
    class_facts,
    function_of,
    is_self,
)
from security.resolve.scopes import (
    FUNCTIONS,
    MAX_HOPS,
    Where,
    definition,
    enclosing_class,
    lookup,
)

SESSION_FACTORIES = {
    "requests.Session",
    "requests.session",
    "requests.sessions.Session",
}
CLIENT_FACTORIES = {"httpx.Client", "httpx.AsyncClient"}
POOL_FACTORIES = {
    "urllib3.PoolManager",
    "urllib3.ProxyManager",
    "urllib3.poolmanager.PoolManager",
    "urllib3.HTTPConnectionPool",
    "urllib3.HTTPSConnectionPool",
    "urllib3.connectionpool.HTTPConnectionPool",
    "urllib3.connectionpool.HTTPSConnectionPool",
    "urllib3.connection_from_url",
    "urllib3.proxy_from_url",
}
OPENER_FACTORIES = {"urllib.request.build_opener"}
KNOWN = SESSION_FACTORIES | CLIENT_FACTORIES | POOL_FACTORIES | OPENER_FACTORIES
PLAIN_ADAPTERS = {"requests.adapters.HTTPAdapter", "requests.HTTPAdapter"}
OVERRIDES = {"request", "send"}


class Made:
    def __init__(self, name, call, configured=False):
        self.name = name
        self.call = call
        self.configured = configured

    def with_configured(self, configured):
        return Made(self.name, self.call, self.configured or configured)


def receiver_key(node, context):
    if isinstance(node, ast.Name):
        return ("name", node.id)
    if isinstance(node, ast.Attribute) and is_self(node.value, context):
        return ("self", node.attr)
    if isinstance(node, ast.Attribute):
        return ("name", node.attr)
    return None


def adapter_sets_timeout(adapter, where):
    if isinstance(adapter, ast.Name):
        values = [
            value for kind, value, _ in lookup(adapter.id, where) if kind == "value"
        ]
        adapter = values[0] if len(values) == 1 else adapter
    if isinstance(adapter, ast.Call):
        return dotted_name(adapter.func, where.context.aliases) not in PLAIN_ADAPTERS
    return True


def request_override(value, where):
    target = partial_target(value, where.context.aliases)
    return target is None or keyword(target, "timeout") is not None


def configured_keys(scope, where):
    nodes = ast.walk(scope) if isinstance(scope, ast.ClassDef) else own_nodes(scope)
    found = set()
    for node in nodes:
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr == "mount" and len(node.args) >= 2:
                if adapter_sets_timeout(node.args[1], where):
                    found.add(receiver_key(node.func.value, where.context))
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Attribute) and target.attr in OVERRIDES:
                    if request_override(node.value, where):
                        found.add(receiver_key(target.value, where.context))
    return found


def is_configured(receiver, where, place):
    context = place.context
    if isinstance(receiver, ast.Attribute) and is_self(receiver.value, where.context):
        scope = enclosing_class(receiver, where.context)
        context = where.context
    else:
        scope = place.scope if place.scope is not None else place.context.tree
    if scope is None:
        return False
    key = ("security-configured", context.path, id(scope))
    keys = context.project.memo(
        key, lambda _: configured_keys(scope, Where(context, None))
    )
    return receiver_key(receiver, where.context) in keys


def session_class(cls, where, hops=0):
    if hops > MAX_HOPS:
        return False
    for base in cls.bases:
        if dotted_name(base, where.context.aliases) in SESSION_FACTORIES:
            return True
    return any(
        session_class(base, place, hops + 1) for base, place in bases_of(cls, where)
    )


def class_configured(cls, where, hops=0):
    facts = class_facts(cls, where.context)
    if OVERRIDES & set(facts.methods) or ("name", "self") in configured_keys(
        cls, where
    ):
        return True
    if hops > MAX_HOPS:
        return False
    return any(
        class_configured(base, place, hops + 1) for base, place in bases_of(cls, where)
    )


def made_by_call(call, where, depth):
    name = dotted_name(call.func, where.context.aliases)
    if name in KNOWN:
        return Made(name, call)
    if isinstance(call.func, ast.Call):
        return None
    cls = definition(call.func, where)
    if cls is not None:
        if session_class(cls[0], cls[1]):
            return Made("requests.Session", call, class_configured(cls[0], cls[1]))
        return None
    target = function_of(call, where)
    if target is None or not isinstance(target[0], FUNCTIONS):
        return None
    inner = Where(target[1].context, target[0])
    returned = [
        n.value for n in own_nodes(target[0]) if isinstance(n, ast.Return) and n.value
    ]
    return combine([made_of(value, inner, depth + 1) for value in returned])


def combine(mades):
    if not mades or any(made is None for made in mades):
        return None
    first = mades[0]
    if any(made.name != first.name for made in mades):
        return None
    return first.with_configured(any(made.configured for made in mades))


def bound_entries(node, where):
    if isinstance(node, ast.Name):
        return [
            (value, place)
            for kind, value, place in lookup(node.id, where)
            if kind == "value"
        ]
    return attribute_values(node, where) or []


def made_of(node, where, depth=0):
    if depth > MAX_HOPS or node is None:
        return None
    if isinstance(node, ast.Call):
        return made_by_call(node, where, depth)
    if not isinstance(node, (ast.Name, ast.Attribute)):
        return None
    mades = []
    for value, place in bound_entries(node, where):
        made = made_of(value, place, depth + 1)
        mades.append(made and made.with_configured(is_configured(node, where, place)))
    return combine(mades)
