import ast
from collections import Counter

from checks.common import dotted_name
from silent_tests.calls import DEFINITIONS

BLIND = {"AssertionError", "Exception", "BaseException"}
LOOPS = (ast.For, ast.AsyncFor)
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
SIMPLE_CONSTRUCTS = (
    (ast.While, "while"),
    (ast.IfExp, "if"),
    (ast.BoolOp, "boolean"),
    (ast.ExceptHandler, "except"),
)


def is_irrefutable(case):
    pattern = case.pattern
    return isinstance(pattern, ast.MatchAs) and pattern.pattern is None and case.guard is None


def int_value(node):
    if isinstance(node, ast.Constant) and type(node.value) is int:
        return node.value
    negated = isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub)
    if (
        negated
        and isinstance(node.operand, ast.Constant)
        and type(node.operand.value) is int
    ):
        return -node.operand.value
    return None


def is_fixed_range(node):
    if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)):
        return False
    if node.func.id != "range" or node.keywords or not 1 <= len(node.args) <= 3:
        return False
    values = [int_value(argument) for argument in node.args]
    step_is_zero = len(values) == 3 and values[2] == 0
    return None not in values and not step_is_zero and len(range(*values)) > 0


MUTATORS = {
    "append", "extend", "insert", "pop", "remove", "clear", "update", "add",
    "discard", "sort", "reverse", "setdefault", "popitem", "difference_update",
    "intersection_update", "symmetric_difference_update",
}  # fmt: skip


def is_literal_table(node, tables):
    if isinstance(node, ast.Name):
        return node.id in tables
    if isinstance(node, ast.Dict):
        return bool(node.keys) and None not in node.keys
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        return bool(node.elts) and not any(isinstance(e, ast.Starred) for e in node.elts)
    return False


def table_binding(node):
    if isinstance(node, ast.Assign) and len(node.targets) == 1:
        target, value = node.targets[0], node.value
    elif isinstance(node, ast.AnnAssign) and node.value is not None:
        target, value = node.target, node.value
    else:
        return None
    named = isinstance(target, ast.Name)
    return target.id if named and is_literal_table(value, frozenset()) else None


def mutates(func):
    return isinstance(func, ast.Attribute) and func.attr in MUTATORS


def altered_names(tree):
    names = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and not isinstance(node.ctx, ast.Load):
            names.append(node.id)
        elif isinstance(node, ast.arg):
            names.append(node.arg)
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            names.extend(node.names)
        elif isinstance(node, (*DEFINITIONS, ast.ClassDef)):
            names.append(node.name)
        elif isinstance(node, ast.alias):
            names.append((node.asname or node.name).split(".")[0])
        elif isinstance(node, ast.ExceptHandler) and node.name:
            names.append(node.name)
        elif isinstance(node, ast.Subscript) and not isinstance(node.ctx, ast.Load):
            names.append(getattr(node.value, "id", None))
        elif isinstance(node, ast.Call) and mutates(node.func):
            names.append(getattr(node.func.value, "id", None))
    return names


def literal_tables(tree):
    bound = [name for name in map(table_binding, tree.body) if name is not None]
    altered = Counter(altered_names(tree))
    return frozenset(name for name in bound if altered[name] == 1)


def loop_kind(node, tables):
    if is_fixed_range(node.iter):
        return None
    if any(is_subtest(n) for n in ast.walk(node)):
        return None if is_literal_table(node.iter, tables) else "subTest"
    return "for"


def construct_kind(node, tables=frozenset()):
    if isinstance(node, LOOPS):
        return loop_kind(node, tables)
    if isinstance(node, COMPREHENSIONS):
        fixed = all(
            not generator.is_async
            and not generator.ifs
            and is_fixed_range(generator.iter)
            for generator in node.generators
        )
        return None if fixed else "comprehension"
    for node_type, kind in SIMPLE_CONSTRUCTS:
        if isinstance(node, node_type):
            return kind
    return None


def is_subtest(node):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "subTest"
    )


def blind_names(arguments, aliases):
    names = {dotted_name(argument, aliases) or "" for argument in arguments}
    return {name.rsplit(".", 1)[-1] for name in names} & BLIND


def is_suppress(item, aliases):
    call = item.context_expr
    if not isinstance(call, ast.Call):
        return False
    return dotted_name(call.func, aliases) == "contextlib.suppress" and bool(
        blind_names(call.args, aliases)
    )


def branching(test, strict):
    stack = [test]
    while stack:
        node = stack.pop()
        if isinstance(node, ast.IfExp):
            constants = [node.body, node.orelse]
            if strict or any(is_bool(constant) for constant in constants):
                return "if"
        elif isinstance(node, ast.BoolOp):
            guards, last = node.values[:-1], node.values[-1]
            implication = any(is_negation(v) for v in guards) and not is_negation(last)
            if isinstance(node.op, ast.Or) and implication:
                return "boolean"
            stack.extend(node.values)
        elif is_negation(node):
            stack.append(node.operand)
    return None


def is_bool(node):
    return isinstance(node, ast.Constant) and isinstance(node.value, bool)


def is_negation(node):
    return isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not)


def disguised(node):
    if isinstance(node, ast.Assert):
        return branching(node.test, True)
    if isinstance(node, ast.Call):
        kinds = [branching(argument, False) for argument in node.args]
        return next((kind for kind in kinds if kind), None)
    return None


def nested_callables(function):
    found = {}
    for node in ast.walk(function):
        if node is function:
            continue
        if isinstance(node, DEFINITIONS):
            found[node.name] = node
        elif isinstance(node, ast.Assign) and isinstance(node.value, ast.Lambda):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    found[target.id] = node.value
    return found


def invoked(call, scan):
    targets = []
    arguments = [*call.args, *(keyword.value for keyword in call.keywords)]
    for candidate in [call.func, *arguments]:
        if isinstance(candidate, ast.Name) and candidate.id in scan.nested:
            targets.append(scan.nested[candidate.id])
        elif isinstance(candidate, ast.Lambda):
            targets.append(candidate)
    return targets


def body_of(callable_node):
    if isinstance(callable_node, ast.Lambda):
        return [callable_node.body]
    return callable_node.body
