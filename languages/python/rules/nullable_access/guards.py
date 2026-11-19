import ast

from checks.common import own_nodes
from nullable_access.uses import position

AUTH_ATTRIBUTES = {"is_authenticated", "is_anonymous"}
GUARD_CALLS = {"isinstance", "bool", "callable", "len"}
CATCHING = {"AttributeError", "TypeError", "Exception", "BaseException"}
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.GeneratorExp, ast.DictComp)
ORDERING = (ast.Lt, ast.Gt, ast.LtE, ast.GtE, ast.In, ast.NotIn)


def unwrapped(node):
    while isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
        node = node.operand
    return node


def leaves(node):
    node = unwrapped(node)
    if isinstance(node, ast.BoolOp):
        for value in node.values:
            yield from leaves(value)
    elif isinstance(node, ast.NamedExpr):
        yield node.target
        yield node.value
    elif isinstance(node, ast.Compare):
        if not any(isinstance(op, ORDERING) for op in node.ops):
            yield node.left
            yield from node.comparators
        else:
            for operand in [node.left, *node.comparators]:
                yield from leaves(operand) if is_len_call(operand) else ()
    elif isinstance(node, ast.Call):
        if getattr(node.func, "id", "") in GUARD_CALLS:
            yield from node.args[:1]
    else:
        yield node


def is_len_call(node):
    return isinstance(node, ast.Call) and getattr(node.func, "id", "") == "len"


def tested_expressions(node):
    if isinstance(node, (ast.If, ast.While, ast.IfExp, ast.Assert)):
        yield node.test
    elif isinstance(node, ast.comprehension):
        yield from node.ifs
    elif isinstance(node, (ast.BoolOp, ast.Compare, ast.Call)):
        yield node


def is_key(leaf, key, authenticated):
    if ast.unparse(leaf) == key:
        return True
    return (
        authenticated
        and isinstance(leaf, ast.Attribute)
        and leaf.attr in AUTH_ATTRIBUTES
        and ast.unparse(leaf.value) == key
    )


def has_key(tests, key, authenticated):
    return any(
        is_key(leaf, key, authenticated) for test in tests for leaf in leaves(test)
    )


def tested_before(function, receiver, key, authenticated):
    limit = position(receiver)
    for node in own_nodes(function):
        for tested in tested_expressions(node):
            for leaf in leaves(tested):
                if is_key(leaf, key, authenticated) and position(leaf) < limit:
                    return True
    return False


def conditional_tests(node, parent):
    if isinstance(parent, ast.IfExp) and node is not parent.test:
        return [parent.test]
    if isinstance(parent, COMPREHENSIONS):
        return [test for generator in parent.generators for test in generator.ifs]
    return []


def in_checked_branch(function, receiver, key, authenticated, parents):
    node = receiver
    while node is not function and id(node) in parents:
        parent = parents[id(node)]
        if has_key(conditional_tests(node, parent), key, authenticated):
            return True
        node = parent
    return False


def assignment_targets(node):
    if isinstance(node, ast.Assign):
        return node.targets
    if isinstance(node, (ast.AugAssign, ast.AnnAssign, ast.NamedExpr)):
        return [node.target]
    if isinstance(node, (ast.For, ast.AsyncFor)):
        return [node.target]
    return []


def reassigned(function, receiver, key):
    limit = position(receiver)
    return any(
        ast.unparse(target) == key and position(target) < limit
        for node in own_nodes(function)
        for target in assignment_targets(node)
    )


def handler_catches(handler):
    if handler.type is None:
        return True
    return any(ast.unparse(item) in CATCHING for item in ast.walk(handler.type))


def caught(function, receiver, parents):
    node = receiver
    while node is not function and id(node) in parents:
        parent = parents[id(node)]
        if isinstance(parent, ast.Try) and node in parent.body:
            if any(handler_catches(handler) for handler in parent.handlers):
                return True
        node = parent
    return False


def is_guarded(function, receiver, key, parents, mode):
    authenticated, reassign = mode
    return (
        tested_before(function, receiver, key, authenticated)
        or in_checked_branch(function, receiver, key, authenticated, parents)
        or (reassign and reassigned(function, receiver, key))
        or caught(function, receiver, parents)
    )
