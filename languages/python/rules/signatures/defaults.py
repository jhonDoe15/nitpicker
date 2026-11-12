import ast

from checks.common import finding
from signatures.annotations import (
    FUNCTION_TYPES,
    NONE_MEMBER,
    defaults_of,
    members_of,
    parameters_of,
    qualified_name,
)

RULE = "falsy-default"
FALSY_TYPES = {
    "int",
    "float",
    "complex",
    "str",
    "bytes",
    "bytearray",
    "bool",
    "list",
    "dict",
    "set",
    "frozenset",
    "tuple",
    "deque",
    "Counter",
    "defaultdict",
    "OrderedDict",
    "List",
    "Dict",
    "Set",
    "FrozenSet",
    "Tuple",
    "Deque",
    "Sequence",
    "MutableSequence",
    "Mapping",
    "MutableMapping",
    "MutableSet",
    "AbstractSet",
    "Collection",
    "Decimal",
    "Fraction",
    "timedelta",
}
CONDITION_PARENTS = (ast.If, ast.While, ast.IfExp, ast.Assert)
TRUTH_CALLS = {"bool", "any", "all"}
EMPTY_CONSTRUCTORS = {
    "list",
    "dict",
    "set",
    "tuple",
    "frozenset",
    "str",
    "int",
    "float",
}
NONE_COMPARISONS = (ast.Is, ast.IsNot, ast.Eq, ast.NotEq)


def is_empty_value(node):
    if isinstance(node, ast.Constant):
        return not node.value
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        return not node.elts
    if isinstance(node, ast.Dict):
        return not node.keys
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in EMPTY_CONSTRUCTORS
        and not node.args
        and not node.keywords
    )


def can_be_falsy(annotation):
    return bool(set(members_of(annotation)) & FALSY_TYPES)


def defaults_to_none(default):
    return isinstance(default, ast.Constant) and default.value is None


def optional_parameters(function):
    defaults = defaults_of(function)
    return {
        argument.arg
        for argument in parameters_of(function)
        if can_be_falsy(argument.annotation)
        and (
            NONE_MEMBER in members_of(argument.annotation)
            or defaults_to_none(defaults.get(argument.arg))
        )
    }


def compared_with_none(function):
    found = set()
    for node in ast.walk(function):
        if isinstance(node, ast.Compare) and isinstance(node.ops[0], NONE_COMPARISONS):
            sides = [node.left, *node.comparators]
            if any(defaults_to_none(side) for side in sides):
                found.update(side.id for side in sides if isinstance(side, ast.Name))
    return found


def is_truth_call(node):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in TRUTH_CALLS
    )


def is_condition(node, context):
    child, parent = node, context.parents.get(id(node))
    if is_truth_call(parent):
        return True
    while isinstance(
        parent, (ast.BoolOp, ast.UnaryOp, ast.comprehension, *CONDITION_PARENTS)
    ):
        if isinstance(parent, ast.BoolOp) and isinstance(parent.op, ast.And):
            return True
        if isinstance(parent, ast.UnaryOp):
            return isinstance(parent.op, ast.Not)
        if isinstance(parent, CONDITION_PARENTS) and parent.test is child:
            return True
        if isinstance(parent, ast.comprehension) and child in parent.ifs:
            return True
        child, parent = parent, context.parents.get(id(parent))
    return False


def coerced_names(node, names):
    if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or):
        if is_empty_value(node.values[-1]):
            return []
        return [
            value.id
            for value in node.values[:-1]
            if isinstance(value, ast.Name) and value.id in names
        ]
    if isinstance(node, ast.IfExp) and isinstance(node.test, ast.Name):
        if is_empty_value(node.orelse):
            return []
        same = isinstance(node.body, ast.Name) and node.body.id == node.test.id
        return [node.test.id] if same and node.test.id in names else []
    return []


def function_findings(function, context):
    names = optional_parameters(function) - compared_with_none(function)
    reported = set()
    found = []
    for node in ast.walk(function) if names else []:
        for name in coerced_names(node, names):
            if name not in reported and not is_condition(node, context):
                reported.add(name)
                subject = f"{qualified_name(function, context)}({name})"
                found.append(finding(context.path, RULE, subject, node))
    return found


def check(context):
    if context.tests:
        return []
    return [
        item
        for node in ast.walk(context.tree)
        if isinstance(node, FUNCTION_TYPES)
        for item in function_findings(node, context)
    ]
