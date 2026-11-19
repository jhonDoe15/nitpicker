import ast

from null_keys.inputs import is_source

COMPARISONS = (ast.Is, ast.IsNot, ast.Eq, ast.NotEq, ast.In, ast.NotIn)


def is_number(node):
    if isinstance(node, ast.UnaryOp):
        node = node.operand
    return (
        isinstance(node, ast.Constant)
        and isinstance(node.value, (int, float))
        and not isinstance(node.value, bool)
    )


def membership_guard(test, names, context):
    if not (
        isinstance(test, ast.Compare)
        and len(test.ops) == 1
        and isinstance(test.ops[0], ast.In)
        and is_source(test.comparators[0], names, context)
    ):
        return None
    key = test.left
    if isinstance(key, ast.Constant) and isinstance(key.value, str):
        return test
    return None


def same_subscript(node, guard):
    return (
        isinstance(node, ast.Subscript)
        and isinstance(node.ctx, ast.Load)
        and ast.unparse(node.value) == ast.unparse(guard.comparators[0])
        and ast.unparse(node.slice) == ast.unparse(guard.left)
    )


def enclosing_function(node, context):
    parent = context.parents.get(id(node))
    while parent is not None and not isinstance(parent, (ast.FunctionDef, ast.AsyncFunctionDef)):
        parent = context.parents.get(id(parent))
    return parent


def is_name(node, name):
    return isinstance(node, ast.Name) and node.id == name


def tests_name(node, name):
    if isinstance(node, ast.Compare):
        return any(is_name(item, name) for item in [node.left, *node.comparators])
    if isinstance(node, ast.BoolOp):
        return any(is_name(item, name) for item in node.values)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
        return is_name(node.operand, name)
    return isinstance(node, (ast.If, ast.IfExp, ast.While)) and is_name(node.test, name)


def name_handled(name, node, context):
    function = enclosing_function(node, context)
    scope = function if function is not None else context.tree
    return any(tests_name(item, name) for item in ast.walk(scope))


def assigned_name(node, context):
    parent = context.parents.get(id(node))
    if isinstance(parent, ast.Assign) and parent.value is node and len(parent.targets) == 1:
        target = parent.targets[0]
        return target.id if isinstance(target, ast.Name) else None
    return None


def handled_read(node, context):
    parent = context.parents.get(id(node))
    while isinstance(parent, ast.NamedExpr):
        name = parent.target.id
        if name_handled(name, node, context):
            return True
        node, parent = parent, context.parents.get(id(parent))
    if isinstance(parent, (ast.Compare, ast.BoolOp, ast.UnaryOp)):
        return True
    if isinstance(parent, (ast.If, ast.IfExp, ast.While)) and parent.test is node:
        return True
    name = assigned_name(node, context)
    return name is not None and name_handled(name, node, context)


def guarded_reads(parts, guard):
    return [
        node
        for part in parts
        for node in ast.walk(part)
        if same_subscript(node, guard)
    ]


def unhandled_read(parts, guard, context):
    reads = guarded_reads(parts, guard)
    return bool(reads) and not any(handled_read(node, context) for node in reads)


def guarded_parts(node, guard):
    if isinstance(node, ast.If):
        return node.body
    if isinstance(node, ast.IfExp):
        return [node.body]
    index = node.values.index(guard)
    return node.values[index + 1 :]


def tests_of(node):
    if isinstance(node, ast.BoolOp):
        return node.values if isinstance(node.op, ast.And) else []
    if isinstance(node, (ast.If, ast.IfExp)):
        test = node.test
        if isinstance(test, ast.BoolOp):
            return test.values if isinstance(test.op, ast.And) else []
        return [test]
    return []


def checked_elsewhere(node, guard):
    if isinstance(node, ast.BoolOp):
        return False
    return any(same_subscript(item, guard) for item in ast.walk(node.test))


def membership_reads(node, names, context):
    found = []
    for candidate in tests_of(node):
        guard = membership_guard(candidate, names, context)
        if guard is None or checked_elsewhere(node, guard):
            continue
        if unhandled_read(guarded_parts(node, candidate), guard, context):
            found.append(guard)
    return found
