import ast

from checks.common import walk_statements

BLOCKS = ("body", "orelse", "finalbody")
CACHES = {"cache", "lru_cache"}


def global_names(function):
    names = set()
    for node in walk_statements(function.body):
        if isinstance(node, ast.Global):
            names.update(node.names)
    return names


def is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


def tested(test, unset):
    if isinstance(test, ast.BoolOp):
        joins = isinstance(test.op, ast.Or) if unset else isinstance(test.op, ast.And)
        parts = [tested(value, unset) for value in test.values]
        return set().union(*parts) if joins and all(parts) else set()
    if isinstance(test, ast.Name):
        return set() if unset else {test.id}
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        return tested(test.operand, not unset) if isinstance(test.operand, ast.Name) else set()
    if isinstance(test, ast.Compare) and len(test.ops) == 1 and isinstance(test.left, ast.Name):
        if is_none(test.comparators[0]):
            absent = isinstance(test.ops[0], (ast.Is, ast.Eq))
            present = isinstance(test.ops[0], (ast.IsNot, ast.NotEq))
            if (unset and absent) or (not unset and present):
                return {test.left.id}
    return set()


def assigns(statements, names):
    for node in walk_statements(statements):
        targets = []
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, (ast.AnnAssign, ast.AugAssign)):
            targets = [node.target]
        elif isinstance(node, ast.NamedExpr):
            targets = [node.target]
        if any(isinstance(t, ast.Name) and t.id in names for t in targets):
            return True
    return False


def memoised_statements(function):
    names = global_names(function)
    found = []
    if not names:
        return found
    for node in [function, *walk_statements(function.body)]:
        for field in BLOCKS:
            block = getattr(node, field, None)
            if not isinstance(block, list):
                continue
            for position, statement in enumerate(block):
                if not isinstance(statement, ast.If):
                    continue
                unset = tested(statement.test, True) & names
                if unset and assigns(statement.body, unset):
                    found.extend(statement.body)
                present = tested(statement.test, False) & names
                leaves = statement.body and isinstance(statement.body[-1], ast.Return)
                rest = block[position + 1 :]
                if present and leaves and not statement.orelse and assigns(rest, present):
                    found.extend(rest)
    return found


def decorator_name(decorator):
    target = decorator.func if isinstance(decorator, ast.Call) else decorator
    if isinstance(target, ast.Attribute):
        return target.attr
    return target.id if isinstance(target, ast.Name) else None


def is_cached_constant(function):
    arguments = function.args
    bare = not (
        arguments.posonlyargs
        or arguments.args
        or arguments.kwonlyargs
        or arguments.vararg
        or arguments.kwarg
    )
    names = {decorator_name(decorator) for decorator in function.decorator_list}
    return bare and bool(names & CACHES)


def once_call_ids(function):
    if is_cached_constant(function):
        return {id(n) for n in walk_statements(function.body) if isinstance(n, ast.Call)}
    return {
        id(node)
        for node in walk_statements(memoised_statements(function))
        if isinstance(node, ast.Call)
    }
