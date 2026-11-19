import ast
from collections import namedtuple

from django_models.fields import Field
from django_models.graph import project_graph
from django_models.lookups import forward_target, resolve_lookup
from django_models.origin import CHAIN
from orm.origins import resolve_name
from security.resolve.scopes import MAX_HOPS, where_of

Keys = namedtuple("Keys", "names or_ unknown")
IGNORED = {"defaults", "create_defaults"}
EXACT = {(), ("exact",), ("iexact",)}
NOTHING = Keys((), False, False)
UNKNOWN = Keys((), False, True)


def merge(first, second, or_=False):
    return Keys(
        first.names + second.names,
        or_ or first.or_ or second.or_,
        first.unknown or second.unknown,
    )


def is_q(node, context):
    function = node.func if isinstance(node, ast.Call) else None
    name = getattr(function, "id", None) or getattr(function, "attr", None)
    return name == "Q"


def q_keys(node, context):
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.BitAnd, ast.BitOr)):
        both = merge(q_keys(node.left, context), q_keys(node.right, context))
        return both._replace(or_=both.or_ or isinstance(node.op, ast.BitOr))
    if not is_q(node, context):
        return UNKNOWN
    inner = NOTHING
    for argument in node.args:
        inner = merge(inner, q_keys(argument, context))
    return merge(inner, call_keys(node, context, positional=False))


def call_keys(call, context, positional=True):
    names, unknown = [], False
    for item in call.keywords:
        if item.arg is None:
            unknown = True
        elif item.arg not in IGNORED:
            names.append(item.arg)
    found = Keys(tuple(names), False, unknown)
    for argument in call.args if positional else []:
        found = merge(found, q_keys(argument, context))
    return found


def chain_keys(node, context, depth=0):
    if depth > MAX_HOPS:
        return UNKNOWN
    if isinstance(node, ast.Name):
        value, place = resolve_name(node, where_of(node, context))
        if value is None or value is node:
            return UNKNOWN
        return chain_keys(value, place.context, depth + 1)
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
        return NOTHING
    if node.func.attr not in CHAIN:
        return UNKNOWN
    found = call_keys(node, context) if node.func.attr == "filter" else NOTHING
    return merge(found, chain_keys(node.func.value, context, depth + 1))


def exact_name(model, key, graph):
    found = resolve_lookup(model, key, graph)
    if found.reverse is not None:
        return ()
    if found.field is None:
        base = key[: -len("_id")] if key.endswith("_id") else None
        field = model.fields.get(base) if base else None
        return (base,) if field is not None and field.relation else None
    if found.field.relation is not None and found.rest and not found.reverse:
        if forward_target(found.model, found.field.relation, graph) is None:
            return None
    if found.rest not in EXACT:
        return ()
    if not found.path:
        return (found.field.name,)
    return through_name(found)


def through_name(found):
    hops = found.path
    if not all(isinstance(hop, Field) and hop.relation for hop in hops):
        return ()
    one_to_one = all(hop.relation.kind == "OneToOneField" for hop in hops)
    if one_to_one and found.field.unique:
        return (hops[0].name,)
    single = len(hops) == 1 and not hops[0].relation.many
    if single and found.field.primary_key:
        return (hops[0].name,)
    return ()


def exact_names(model, keys, project):
    graph = project_graph(project)
    names = set()
    for key in keys:
        found = exact_name(model, key, graph)
        if found is None:
            return None
        names.update(found)
    return names


def is_covered(model, names):
    if any(model.fields[name].unique for name in names if name in model.fields):
        return True
    return any(unique.fields <= names for unique in model.uniques)


def mutable_key(model, keys, project, kinds):
    graph = project_graph(project)
    for key in keys:
        found = resolve_lookup(model, key, graph)
        if found.field is not None and not found.path and found.rest in EXACT:
            if found.field.type in kinds:
                return key
    return None
