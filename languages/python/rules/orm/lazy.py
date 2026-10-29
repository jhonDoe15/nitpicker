import ast

from checks.common import finding
from kinds.names import call_text
from orm.accesses import helper_accesses, lazy_accesses, mapped_accesses
from orm.origins import origin_of

RULE = "lazy-relation-in-loop"
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)


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


def subject_of(origin, name, helper=None):
    subject = f"{origin.model.name}.{name}|{origin.orm}|{origin.text}"
    return f"{subject}|{call_text(helper)}" if helper is not None else subject


def loop_findings(node, context):
    parts = loop_parts(node)
    if parts is None or not isinstance(parts[0], ast.Name):
        return []
    target, iterable, body = parts
    origin = origin_of(iterable, context)
    if origin is None:
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
