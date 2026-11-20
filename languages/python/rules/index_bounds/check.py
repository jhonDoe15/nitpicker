import ast

from checks.common import finding

GUARDED = True
RULE = "index-bound-off-by-one"
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
LEAVING = (ast.Return, ast.Raise, ast.Continue, ast.Break)
BODY_FIELDS = ("body", "orelse", "finalbody")


def length_owner(node):
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "len"
        and len(node.args) == 1
    ):
        return ast.unparse(node.args[0])
    return None


def bound_of(node, rejecting):
    if not isinstance(node, ast.Compare) or len(node.ops) != 1:
        return None
    left, right, op = node.left, node.comparators[0], node.ops[0]
    direct, flipped = (ast.Gt, ast.Lt) if rejecting else (ast.LtE, ast.GtE)
    if isinstance(op, direct) and isinstance(left, ast.Name):
        owner = length_owner(right)
        return (left.id, owner) if owner else None
    if isinstance(op, flipped) and isinstance(right, ast.Name):
        owner = length_owner(left)
        return (right.id, owner) if owner else None
    return None


def reads(nodes, index, owner):
    for root in nodes:
        for node in ast.walk(root):
            if (
                isinstance(node, ast.Subscript)
                and isinstance(node.ctx, ast.Load)
                and isinstance(node.slice, ast.Name)
                and node.slice.id == index
                and ast.unparse(node.value) == owner
            ):
                return True
    return False


def leaves(body):
    return any(isinstance(node, LEAVING) for statement in body for node in ast.walk(statement))


def strict_checked(function, index, owner):
    strict = {
        f"{index} >= len({owner})",
        f"{index} < len({owner})",
        f"len({owner}) <= {index}",
        f"len({owner}) > {index}",
    }
    for node in ast.walk(function):
        if isinstance(node, ast.Compare) and ast.unparse(node) in strict:
            return True
        if isinstance(node, ast.Name) and node.id == index and isinstance(node.ctx, ast.Store):
            return True
        if isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name):
            if node.target.id == index:
                return True
    return False


def following(statement, parents):
    parent = parents.get(id(statement))
    for field in BODY_FIELDS:
        statements = getattr(parent, field, None)
        if isinstance(statements, list) and statement in statements:
            return statements[statements.index(statement) + 1 :]
    return []


def enclosing_function(node, parents):
    while node is not None and not isinstance(node, FUNCTIONS):
        node = parents.get(id(node))
    return node


def parts_of(test, operator):
    if isinstance(test, ast.BoolOp) and isinstance(test.op, operator):
        return list(test.values)
    return [test]


def check_if(node, context):
    found = []
    function = enclosing_function(node, context.parents)
    if function is None:
        return found
    rejecting = parts_of(node.test, ast.Or)
    for at, part in enumerate(rejecting):
        pair = bound_of(part, True)
        if pair is None or strict_checked(function, *pair):
            continue
        after = following(node, context.parents) if not node.orelse and leaves(node.body) else []
        if reads([*rejecting[at + 1 :], *after], *pair):
            found.append((part, pair))
    accepting = parts_of(node.test, ast.And)
    for at, part in enumerate(accepting):
        pair = bound_of(part, False)
        if pair is not None and not strict_checked(function, *pair):
            if reads([*accepting[at + 1 :], *node.body], *pair):
                found.append((part, pair))
    return found


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.If):
            for part, (index, owner) in check_if(node, context):
                found.append(finding(context.path, RULE, f"{index} {owner}", part))
        elif isinstance(node, ast.BoolOp):
            parent = context.parents.get(id(node))
            if isinstance(parent, ast.If) and parent.test is node:
                continue
            function = enclosing_function(node, context.parents)
            if function is None:
                continue
            rejecting = isinstance(node.op, ast.Or)
            for at, part in enumerate(node.values):
                pair = bound_of(part, rejecting)
                if pair and not strict_checked(function, *pair) and reads(node.values[at + 1 :], *pair):
                    found.append(finding(context.path, RULE, f"{pair[0]} {pair[1]}", part))
    return found
