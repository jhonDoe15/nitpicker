import ast

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


def construct_kind(node):
    if isinstance(node, LOOPS):
        return "subTest" if any(is_subtest(n) for n in ast.walk(node)) else "for"
    if isinstance(node, COMPREHENSIONS):
        return "comprehension"
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
