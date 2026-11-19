import ast

from null_branches.targets import (
    SCOPES,
    is_store,
    nodes_within,
    own_children,
    target_key,
)

STOP = object()
CHECK_PARENTS = (ast.UnaryOp, ast.Compare, ast.BoolOp)
CHECK_CALLS = {"bool", "isinstance"}
ITERATING_CALLS = {
    "len",
    "list",
    "tuple",
    "set",
    "sorted",
    "sum",
    "iter",
    "enumerate",
    "min",
    "max",
}
BOUNDARY = (ast.stmt, ast.Module, ast.Lambda)


def is_check(node, parents):
    parent = parents.get(id(node))
    if isinstance(parent, CHECK_PARENTS):
        return True
    if isinstance(parent, (ast.If, ast.IfExp, ast.While, ast.Assert)):
        return parent.test is node
    if isinstance(parent, ast.Match):
        return parent.subject is node
    return (
        isinstance(parent, ast.Call)
        and isinstance(parent.func, ast.Name)
        and parent.func.id in CHECK_CALLS
    )


def checks(expression, scan):
    return any(
        target_key(node) == scan["key"] and is_check(node, scan["parents"])
        for node in nodes_within(expression)
    )


def matches_none(node):
    return any(
        isinstance(pattern, ast.MatchSingleton) and pattern.value is None
        for case in node.cases
        for pattern in ast.walk(case.pattern)
    )


def guard_expression(node):
    if isinstance(node, ast.Match):
        return node.subject if matches_none(node) else None
    if isinstance(node, (ast.If, ast.IfExp, ast.While, ast.Assert)):
        return node.test
    return None


def is_passed_on(node, scan):
    child = node
    parent = scan["parents"].get(id(child))
    while parent is not None and not isinstance(parent, BOUNDARY):
        if (
            isinstance(parent, ast.Call)
            and child in parent.args
            and ast.unparse(parent.func) in scan["callees"]
        ):
            return True
        child = parent
        parent = scan["parents"].get(id(child))
    return False


def is_dereference(node, scan):
    parent = scan["parents"].get(id(node))
    if isinstance(parent, (ast.Attribute, ast.Subscript)):
        return parent.value is node
    if isinstance(parent, ast.Starred):
        return True
    if isinstance(parent, (ast.For, ast.AsyncFor, ast.comprehension)):
        return parent.iter is node
    if isinstance(parent, ast.Assign):
        return parent.value is node and isinstance(
            parent.targets[0], (ast.Tuple, ast.List)
        )
    return (
        isinstance(parent, ast.Call)
        and isinstance(parent.func, ast.Name)
        and parent.func.id in ITERATING_CALLS
        and parent.args[:1] == [node]
    )


def scan_children(node, scan):
    for child in own_children(node):
        found = scan_node(child, scan)
        if found is not None:
            return found
    return None


def scan_boolean(node, scan):
    for value in node.values:
        if checks(value, scan):
            return STOP
        found = scan_node(value, scan)
        if found is not None:
            return found
    return None


def scan_rebinding(node, scan):
    value = getattr(node, "value", None)
    found = scan_node(value, scan) if value is not None else None
    return found or STOP


def rebinds_here(node, key):
    targets = [node.target] if hasattr(node, "target") else getattr(node, "targets", [])
    return any(
        target_key(inner) == key and is_store(inner)
        for target in targets
        for inner in nodes_within(target)
    )


def scan_node(node, scan):
    guard = guard_expression(node)
    if guard is not None and checks(guard, scan):
        return STOP
    if isinstance(node, ast.BoolOp):
        return scan_boolean(node, scan)
    if target_key(node) == scan["key"]:
        used = is_dereference(node, scan) or is_passed_on(node, scan)
        return node if used and not is_store(node) else None
    assigns = isinstance(
        node, (ast.Assign, ast.AugAssign, ast.AnnAssign, ast.NamedExpr)
    )
    if assigns and rebinds_here(node, scan["key"]):
        return scan_rebinding(node, scan)
    if isinstance(node, SCOPES):
        return scan_called_lambda(node, scan)
    return scan_children(node, scan)


def scan_called_lambda(node, scan):
    parent = scan["parents"].get(id(node))
    called = isinstance(node, ast.Lambda) and isinstance(parent, ast.Call)
    return scan_children(node, scan) if called and parent.func is node else None


def first_use(statements, scan):
    for statement in statements:
        found = scan_node(statement, scan)
        if found is not None:
            return None if found is STOP else found
    return None


MAX_SHOWN = 40


def use_text(node, parents):
    parent = parents.get(id(node))
    grand = parents.get(id(parent))
    if (
        isinstance(parent, ast.Attribute)
        and isinstance(grand, ast.Call)
        and grand.func is parent
    ):
        parent = grand
    if isinstance(parent, (ast.For, ast.AsyncFor)):
        text = f"for ... in {ast.unparse(node)}"
    else:
        text = " ".join(ast.unparse(parent if parent is not None else node).split())
    return text if len(text) <= MAX_SHOWN else text[:MAX_SHOWN] + "..."
