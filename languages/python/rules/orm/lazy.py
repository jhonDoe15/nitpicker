import ast

from checks.common import finding
from kinds.names import call_text
from orm.accesses import helper_accesses, lazy_accesses, mapped_accesses
from orm.origins import origin_of

RULE = "lazy-relation-in-loop"
GUARDED = True
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
LOADERS = {"prefetch_related_objects", "refresh", "refresh_from_db"}


def enumerated(target, iterable):
    if (
        isinstance(target, ast.Tuple)
        and len(target.elts) == 2
        and isinstance(iterable, ast.Call)
        and isinstance(iterable.func, ast.Name)
        and iterable.func.id == "enumerate"
        and iterable.args
    ):
        return target.elts[1], iterable.args[0]
    return target, iterable


def loop_parts(node):
    if isinstance(node, (ast.For, ast.AsyncFor)):
        return (*enumerated(node.target, node.iter), list(node.body))
    if isinstance(node, COMPREHENSIONS):
        first = node.generators[0]
        body = [node.key, node.value] if isinstance(node, ast.DictComp) else [node.elt]
        body += first.ifs
        for generator in node.generators[1:]:
            body += [generator.target, generator.iter, *generator.ifs]
        return (*enumerated(first.target, first.iter), body)
    return None


def call_leaf(call):
    function = call.func
    return function.attr if isinstance(function, ast.Attribute) else getattr(function, "id", "")


def names_in(node):
    return {n.id for n in ast.walk(node) if isinstance(n, ast.Name)}


def enclosing_scope(node, parents):
    while id(node) in parents:
        node = parents[id(node)]
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return node
    return None


def loads_explicitly(loop, target, iterable, context):
    names = {target.id}
    if isinstance(iterable, ast.Name):
        names.add(iterable.id)
    scope = enclosing_scope(loop, context.parents) or context.tree
    return any(
        isinstance(node, ast.Call)
        and call_leaf(node) in LOADERS
        and any(names & names_in(part) for part in [node.func, *node.args])
        for node in ast.walk(scope)
    )


def subject_of(origin, name, helper=None):
    subject = f"{origin.model.name}.{name}|{origin.orm}|{origin.text}"
    return f"{subject}|{call_text(helper)}" if helper is not None else subject


def loop_findings(node, context):
    parts = loop_parts(node)
    if parts is None or not isinstance(parts[0], ast.Name):
        return []
    target, iterable, body = parts
    origin = origin_of(iterable, context)
    if origin is None or loads_explicitly(node, target, iterable, context):
        return []
    direct = lazy_accesses(target.id, body, origin, context.parents)
    found = [(subject_of(origin, name), access) for name, access in direct.items()]
    for name, call in helper_accesses(target.id, body, origin, context).items():
        if name not in direct:
            found.append((subject_of(origin, name, call), call))
    return found


def map_findings(node, context):
    if not (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "map"
        and len(node.args) == 2
    ):
        return []
    reference, iterable = node.args
    origin = origin_of(iterable, context)
    if origin is None:
        return []
    accesses = mapped_accesses(reference, origin, context)
    return [(subject_of(origin, name, reference), node) for name in accesses]


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        for subject, place in loop_findings(node, context) + map_findings(
            node, context
        ):
            found.append(finding(context.path, RULE, subject, place))
    return found
