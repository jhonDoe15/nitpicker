import ast
from collections import Counter

from checks.common import last_name
from signatures.annotations import (
    FUNCTION_TYPES,
    NONE_MEMBER,
    defaults_of,
    members_of,
    parameters_of,
)
from truthiness.fields import is_number

MANAGERS = {"objects", "_default_manager"}
QUERYSET_METHODS = {
    "all",
    "filter",
    "exclude",
    "order_by",
    "values",
    "values_list",
    "annotate",
    "select_related",
    "prefetch_related",
    "distinct",
    "only",
    "defer",
    "using",
    "none",
    "union",
    "intersection",
    "difference",
    "reverse",
    "alias",
    "select_for_update",
}
RECEIVERS = {"self", "cls"}


QUERYSET_BASES = ("QuerySet", "Manager")
CHAIN_METHODS = QUERYSET_METHODS | {"get_queryset"}


def is_chain_from_self(node, custom):
    allowed = CHAIN_METHODS | custom
    while isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        if node.func.attr not in allowed:
            return False
        node = node.func.value
    return isinstance(node, ast.Name) and node.id in RECEIVERS


def returns_queryset(function, custom):
    if function.returns is not None and "QuerySet" not in members_of(function.returns):
        return False
    values = [
        node.value
        for node in ast.walk(function)
        if isinstance(node, ast.Return) and node.value is not None
    ]
    return bool(values) and all(is_chain_from_self(value, custom) for value in values)


def is_queryset_class(node):
    return any((last_name(base) or "").endswith(QUERYSET_BASES) for base in node.bases)


def custom_queryset_methods(project):
    def build(_):
        found = set()
        classes = [
            node
            for context in project.contexts.values()
            for node in ast.walk(context.tree)
            if isinstance(node, ast.ClassDef) and is_queryset_class(node)
        ]
        for _pass in range(2):
            for node in classes:
                found.update(
                    item.name
                    for item in node.body
                    if isinstance(item, FUNCTION_TYPES)
                    and not item.name.startswith("_")
                    and returns_queryset(item, found)
                )
        return frozenset(found)

    return project.memo("custom-queryset-methods", build)


def is_queryset_expression(node, project=None):
    if not isinstance(node, ast.Call):
        return False
    custom = custom_queryset_methods(project) if project is not None else frozenset()
    allowed = QUERYSET_METHODS | custom
    current = node
    while isinstance(current, ast.Call) and isinstance(current.func, ast.Attribute):
        if current.func.attr not in allowed:
            return False
        current = current.func.value
        if isinstance(current, ast.Attribute) and current.attr in MANAGERS:
            return not (
                isinstance(current.value, ast.Name) and current.value.id in RECEIVERS
            )
    return False


def enclosing(node, context, kinds):
    parent = context.parents.get(id(node))
    while parent is not None and not isinstance(parent, kinds):
        parent = context.parents.get(id(parent))
    return parent


def number_methods(project):
    def build(_):
        counts, methods, functions = Counter(), {}, {}
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if isinstance(node, ast.ClassDef):
                    counts[node.name] += 1
                    found = {
                        item.name
                        for item in node.body
                        if isinstance(item, FUNCTION_TYPES) and is_number(item.returns)
                    }
                    methods.setdefault(node.name, set()).update(found)
                elif isinstance(node, ast.Module):
                    for item in node.body:
                        if isinstance(item, FUNCTION_TYPES):
                            functions.setdefault(item.name, []).append(item)
        unique = {name for name, total in counts.items() if total == 1}
        top = {
            name
            for name, found in functions.items()
            if len(found) == 1 and is_number(found[0].returns)
        }
        return {name: methods[name] for name in unique}, top

    return project.memo("number-methods", build)


def annotated_class(receiver, function):
    if function is None or not isinstance(receiver, ast.Name):
        return None
    annotations = {
        argument.arg: argument.annotation for argument in parameters_of(function)
    }
    for node in ast.walk(function):
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            annotations[node.target.id] = node.annotation
    members = set(members_of(annotations.get(receiver.id))) - {NONE_MEMBER}
    return next(iter(members)) if len(members) == 1 else None


def receiver_class(receiver, function, context):
    if isinstance(receiver, ast.Name) and receiver.id in RECEIVERS:
        owner = enclosing(function, context, ast.ClassDef) if function else None
        return owner.name if owner is not None else None
    return annotated_class(receiver, function)


def is_number_call(node, context):
    if not isinstance(node, ast.Call):
        return None
    classes, top = number_methods(context.project)
    if isinstance(node.func, ast.Name):
        return node.func.id if node.func.id in top else None
    if not isinstance(node.func, ast.Attribute):
        return None
    function = enclosing(node, context, FUNCTION_TYPES)
    owner = receiver_class(node.func.value, function, context)
    return node.func.attr if node.func.attr in classes.get(owner, ()) else None


def bound_once(nodes, bound_names):
    counts = Counter(name for node in nodes for name in bound_names(node))
    return {name for name, total in counts.items() if total == 1}


def source_value(node):
    if isinstance(node, ast.Assign) and len(node.targets) == 1:
        target = node.targets[0]
        return (target.id, node.value) if isinstance(target, ast.Name) else None
    if isinstance(node, ast.NamedExpr):
        return node.target.id, node.value
    return None


def sourced_names(nodes, context, bound_names):
    once = bound_once(nodes, bound_names)
    found = {}
    for node in nodes:
        pair = source_value(node)
        if pair is None or pair[0] not in once:
            continue
        if is_number_call(pair[1], context) or is_queryset_expression(
            pair[1], context.project
        ):
            found[pair[0]] = node
    return found


def fallback_target(node):
    if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or):
        first = node.values[0]
        return first.id if isinstance(first, ast.Name) else None, node.values[-1]
    if isinstance(node, ast.IfExp) and isinstance(node.test, ast.Name):
        return node.test.id, node.orelse
    return None, None


def queryset_fallbacks(function, project):
    defaults = defaults_of(function)
    untyped = {
        argument.arg
        for argument in parameters_of(function)
        if argument.annotation is None
        and isinstance(defaults.get(argument.arg), ast.Constant)
        and defaults[argument.arg].value is None
    }
    found = set()
    for node in ast.walk(function) if untyped else []:
        name, fallback = fallback_target(node)
        if name in untyped and is_queryset_expression(fallback, project):
            found.add(name)
    return found
