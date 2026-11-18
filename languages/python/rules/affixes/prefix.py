import ast
import re

from affixes.boundary import ends_with_boundary, leading_text, starts_with_boundary, text_of
from affixes.names import (
    is_directory_name,
    is_host_name,
    is_location_name,
    module_constants,
)
from checks.common import finding

RULE = "prefix-without-boundary"
ORIGIN_ONLY = re.compile(r"^https?://[^/]+$", re.IGNORECASE)
PATH_SHAPED = re.compile(r"^(?:[/~@]|[\w.-]+/)")
SHOWN = 40


def same(left, right):
    return ast.unparse(left) == ast.unparse(right)


def climbs(parent, current):
    if isinstance(parent, (ast.BoolOp, ast.UnaryOp)):
        return True
    return isinstance(parent, ast.IfExp) and parent.test is current


def condition_root(node, parents):
    current = node
    while climbs(parents.get(id(current)), current):
        current = parents[id(current)]
    return current


def leading_check(call, arg, constants):
    func = call.func
    return (
        isinstance(func, ast.Attribute)
        and func.attr == "startswith"
        and bool(call.args)
        and same(func.value, arg)
        and starts_with_boundary(call.args[0], constants)
    )


def equal_pair(node, receiver, arg):
    if not (isinstance(node, ast.Compare) and len(node.ops) == 1 and isinstance(node.ops[0], ast.Eq)):
        return False
    left, right = node.left, node.comparators[0]
    return (same(left, receiver) and same(right, arg)) or (same(left, arg) and same(right, receiver))


def anchored_sibling(node, receiver, arg, constants):
    func = node.func
    return (
        isinstance(func, ast.Attribute)
        and same(func.value, receiver)
        and ast.unparse(arg) in ast.unparse(node.args[0])
        and ends_with_boundary(node.args[0], constants)
    )


def indexed_boundary(node, receiver):
    if not isinstance(node, ast.Compare) or len(node.comparators) != 1:
        return False
    sides = (node.left, node.comparators[0])
    indexed = [side for side in sides if isinstance(side, ast.Subscript) and same(side.value, receiver)]
    other = [side for side in sides if side not in indexed]
    return bool(indexed) and bool(other) and isinstance(other[0], (ast.Constant, ast.Attribute))


def enclosing_function(node, parents):
    current = parents.get(id(node))
    while current is not None and not isinstance(current, (ast.FunctionDef, ast.AsyncFunctionDef)):
        current = parents.get(id(current))
    return current


def guarded(call, receiver, arg, parents, constants):
    function = enclosing_function(call, parents)
    for node in ast.walk(function) if function is not None else []:
        if isinstance(node, ast.Call) and node is not call and node.args and leading_check(node, arg, constants):
            return True
    for node in ast.walk(condition_root(call, parents)):
        if indexed_boundary(node, receiver):
            return True
        if equal_pair(node, receiver, arg):
            return True
        if node is call or not isinstance(node, ast.Call) or not node.args:
            continue
        if leading_check(node, arg, constants) or anchored_sibling(node, receiver, arg, constants):
            return True
    return False


def starts_with_kind(receiver, arg, constants):
    literal = text_of(arg, constants)
    if literal is not None:
        return "origin" if ORIGIN_ONLY.match(literal) else None
    built = leading_text(arg, constants)
    if built is not None and PATH_SHAPED.match(built) and is_location_name(receiver):
        return None if ends_with_boundary(arg, constants) else "prefix"
    named = is_directory_name(arg) and not ends_with_boundary(arg, constants)
    return "prefix" if named else None


def assigns_name(node, name):
    if isinstance(node, ast.Assign):
        return any(isinstance(target, ast.Name) and target.id == name for target in node.targets)
    if isinstance(node, (ast.AugAssign, ast.AnnAssign)) and node.value is not None:
        return isinstance(node.target, ast.Name) and node.target.id == name
    return False


def assigned_values(function, name):
    nodes = ast.walk(function) if function is not None else []
    return [node.value for node in nodes if assigns_name(node, name)]


def normalized(call, arg, parents, constants):
    if not isinstance(arg, ast.Name):
        return False
    values = assigned_values(enclosing_function(call, parents), arg.id)
    return any(ends_with_boundary(value, constants) for value in values)


def ends_with_kind(receiver, arg, constants):
    literal = text_of(arg, constants)
    named_literal = literal is not None and re.search(r"[A-Za-z0-9]", literal) is not None
    host_like = (is_host_name(arg) and is_location_name(receiver)) or (
        is_host_name(receiver) and named_literal
    )
    return "suffix" if host_like and not starts_with_boundary(arg, constants) else None


def affix_call(node):
    func = node.func
    if not isinstance(func, ast.Attribute) or func.attr not in {"startswith", "endswith"}:
        return None
    if len(node.args) != 1 or node.keywords or isinstance(node.args[0], (ast.Starred, ast.Tuple)):
        return None
    return func.value, func.attr, node.args[0]


def call_kind(node, constants, parents):
    found = affix_call(node)
    if found is None:
        return None, None
    receiver, method, arg = found
    check_kind = starts_with_kind if method == "startswith" else ends_with_kind
    kind = check_kind(receiver, arg, constants)
    return (None if normalized(node, arg, parents, constants) else kind), (receiver, arg)


def check(context):
    if context.tests:
        return []
    constants = module_constants(context.tree)
    found = []
    for node in ast.walk(context.tree):
        kind, pair = call_kind(node, constants, context.parents) if isinstance(node, ast.Call) else (None, None)
        if kind is not None and not guarded(node, pair[0], pair[1], context.parents, constants):
            found.append(finding(context.path, RULE, f"{kind}|{ast.unparse(node)[:SHOWN]}", node))
    return found
