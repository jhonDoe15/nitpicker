import ast

from checks.common import dotted_name
from signatures.annotations import members_of, parameters_of
from truthiness.numbers import bound_names

DATETIME = "datetime"
DELTA = "delta"
DATETIME_TYPES = {"datetime", "date"}
DATETIME_CALLS = {
    "datetime.datetime.now",
    "datetime.datetime.utcnow",
    "datetime.datetime.today",
    "datetime.datetime.fromtimestamp",
    "datetime.datetime.utcfromtimestamp",
    "datetime.datetime.fromisoformat",
    "datetime.datetime.strptime",
    "datetime.date.today",
    "datetime.date.fromisoformat",
    "django.utils.timezone.now",
    "django.utils.timezone.localtime",
}
DELTA_CALLS = {"datetime.timedelta"}


def annotation_kind(annotation):
    members = set(members_of(annotation)) - {"None"}
    if members and members <= DATETIME_TYPES:
        return DATETIME
    return DELTA if members == {"timedelta"} else None


def delta_fields(function, context):
    parent = context.parents.get(id(function))
    if not isinstance(parent, ast.ClassDef):
        return set()
    return {
        item.target.id
        for item in parent.body
        if isinstance(item, ast.AnnAssign)
        and isinstance(item.target, ast.Name)
        and annotation_kind(item.annotation) == DELTA
    }


def difference_kind(node, env, context, fields):
    left = kind_of(node.left, env, context, fields)
    right = kind_of(node.right, env, context, fields)
    if DATETIME in (left, right) and DELTA not in (left, right):
        return DELTA
    if left == right == DELTA:
        return DELTA
    return DATETIME if left == DATETIME and right == DELTA else None


def kind_of(node, env, context, fields):
    if isinstance(node, ast.Name):
        return env.get(node.id)
    if isinstance(node, ast.Call):
        name = dotted_name(node.func, context.aliases)
        if name in DATETIME_CALLS:
            return DATETIME
        return DELTA if name in DELTA_CALLS else None
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Sub):
        return difference_kind(node, env, context, fields)
    is_field = (
        isinstance(node, ast.Attribute)
        and isinstance(node.value, ast.Name)
        and node.value.id in {"self", "cls"}
        and node.attr in fields
    )
    return DELTA if is_field else None


def declared_kinds(function, nodes, counts):
    env = {
        argument.arg: annotation_kind(argument.annotation)
        for argument in parameters_of(function)
        if counts.get(argument.arg, 0) == 0
    }
    for node in nodes:
        is_local = isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)
        if is_local and counts.get(node.target.id, 0) <= 1:
            env[node.target.id] = annotation_kind(node.annotation)
    return {name: kind for name, kind in env.items() if kind is not None}


def environment(function, nodes, context, fields):
    counts = {}
    for node in nodes:
        for name in bound_names(node):
            counts[name] = counts.get(name, 0) + 1
    env = declared_kinds(function, nodes, counts)
    for _ in range(2):
        for node in nodes:
            is_single = (
                isinstance(node, ast.Assign)
                and len(node.targets) == 1
                and isinstance(node.targets[0], ast.Name)
                and counts[node.targets[0].id] == 1
            )
            kind = kind_of(node.value, env, context, fields) if is_single else None
            if kind is not None:
                env[node.targets[0].id] = kind
    return env
