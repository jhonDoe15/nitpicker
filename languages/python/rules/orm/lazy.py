import ast

from checks.common import finding, walk_statements
from orm.origins import EVERYTHING, FORWARD, origin_of

RULE = "lazy-relation-in-loop"
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
MANAGER_QUERIES = {
    "all",
    "filter",
    "exclude",
    "count",
    "exists",
    "first",
    "last",
    "get",
    "order_by",
    "values",
    "values_list",
    "aggregate",
    "annotate",
    "iterator",
    "distinct",
    "earliest",
    "latest",
    "in_bulk",
}


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


def is_covered(relation, plan):
    if relation.name in plan or EVERYTHING in plan:
        return True
    return FORWARD in plan and not relation.reverse and not relation.manager


def loads_relation(node, relation, parents):
    if relation.manager:
        parent = parents.get(id(node))
        call = parents.get(id(parent))
        return (
            isinstance(parent, ast.Attribute)
            and parent.attr in MANAGER_QUERIES
            and isinstance(call, ast.Call)
            and call.func is parent
        )
    return isinstance(node.ctx, ast.Load)


def lazy_accesses(variable, body, origin, parents):
    found = {}
    attributes = [n for n in walk_statements(body) if isinstance(n, ast.Attribute)]
    for node in sorted(attributes, key=lambda n: (n.lineno, n.col_offset)):
        if not (isinstance(node.value, ast.Name) and node.value.id == variable):
            continue
        relation = origin.relations.get(node.attr)
        if relation is None or not relation.lazy or is_covered(relation, origin.plan):
            continue
        if loads_relation(node, relation, parents):
            found.setdefault(relation.name, node)
    return found


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        parts = loop_parts(node)
        if parts is None or not isinstance(parts[0], ast.Name):
            continue
        target, iterable, body = parts
        origin = origin_of(iterable, context)
        if origin is None:
            continue
        accesses = lazy_accesses(target.id, body, origin, context.parents)
        for name, access in accesses.items():
            subject = f"{origin.model.name}.{name}|{origin.orm}|{origin.text}"
            found.append(finding(context.path, RULE, subject, access))
    return found
