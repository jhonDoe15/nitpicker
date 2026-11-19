import ast

from checks.common import last_name
from signatures.annotations import members_of, parameters_of
from truthiness.numbers import bound_names

SEQUENCE_DISPLAYS = (
    ast.Tuple,
    ast.List,
    ast.Dict,
    ast.Set,
    ast.ListComp,
    ast.SetComp,
    ast.DictComp,
    ast.GeneratorExp,
    ast.Starred,
)
SEQUENCE_TYPES = {
    "tuple",
    "Tuple",
    "list",
    "List",
    "Sequence",
    "Iterable",
    "Collection",
    "dict",
    "Dict",
    "Mapping",
    "set",
    "Set",
}
SEQUENCE_CALLS = {
    "tuple",
    "list",
    "set",
    "dict",
    "sorted",
    "reversed",
    "zip",
    "split",
    "rsplit",
    "splitlines",
    "partition",
    "fetchall",
    "fetchmany",
    "fetchone",
    "divmod",
    "popitem",
}
PLURAL_EXCEPTIONS = ("ss", "us", "is")
PLURAL_NAMES = {"args", "params", "parameters", "vars", "kwargs"}


def is_plural(name):
    if name is None:
        return False
    lowered = name.lower()
    return lowered in PLURAL_NAMES or (
        lowered.endswith("s") and not lowered.endswith(PLURAL_EXCEPTIONS)
    )


def tuple_returners(context):
    return {
        node.name
        for node in ast.walk(context.tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and set(members_of(node.returns)) & {"tuple", "Tuple"}
    }


def sequence_names(scope, nodes, returners=frozenset()):
    arguments = parameters_of(scope) if hasattr(scope, "args") else []
    names = {
        argument.arg
        for argument in arguments
        if set(members_of(argument.annotation)) & SEQUENCE_TYPES
    }
    counts = {}
    for node in nodes:
        for name in bound_names(node):
            counts[name] = counts.get(name, 0) + 1
    for node in nodes:
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if set(members_of(node.annotation)) & SEQUENCE_TYPES:
                names.add(node.target.id)
        is_single = (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and counts[node.targets[0].id] == 1
        )
        if is_single and holds_sequence(node.value, set(), returners):
            names.add(node.targets[0].id)
    return names


def has_text_side(value):
    return any(
        isinstance(side, ast.JoinedStr)
        or (isinstance(side, ast.Constant) and isinstance(side.value, str))
        for side in (value.left, value.right)
    )


def holds_sequence(value, names, returners=frozenset()):
    if isinstance(value, SEQUENCE_DISPLAYS):
        return True
    if isinstance(value, ast.Constant):
        return value.value is None
    if isinstance(value, ast.Name):
        return value.id in names or is_plural(value.id)
    if isinstance(value, ast.Attribute):
        return is_plural(value.attr)
    if isinstance(value, ast.Call):
        name = last_name(value.func)
        return name in SEQUENCE_CALLS or name in returners or is_plural(name)
    if isinstance(value, ast.JoinedStr):
        return False
    return not (isinstance(value, ast.BinOp) and has_text_side(value))
