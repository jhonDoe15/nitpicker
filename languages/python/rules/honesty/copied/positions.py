import ast

from checks.common import dotted_name

BODY_FIELDS = {"body", "orelse", "finalbody", "handlers", "cases"}
IDENTITY_KEYWORDS = {"pytest.mark.parametrize": "ids", "pytest.param": "id"}
PARAMETRIZE = "pytest.mark.parametrize"
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def is_text(node):
    return isinstance(node, ast.Constant) and isinstance(node.value, str)


def identity_arguments(call, aliases):
    name = dotted_name(call.func, aliases)
    keyword = IDENTITY_KEYWORDS.get(name)
    roots = [item.value for item in call.keywords if keyword and item.arg == keyword]
    if name == PARAMETRIZE and call.args:
        roots.append(call.args[0])
    return roots


def excluded_roots(tree, aliases):
    roots = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            roots.append(node)
        elif isinstance(node, ast.arg) and node.annotation is not None:
            roots.append(node.annotation)
        elif isinstance(node, FUNCTIONS) and node.returns is not None:
            roots.append(node.returns)
        elif isinstance(node, ast.AnnAssign):
            roots.append(node.annotation)
        elif isinstance(node, ast.Expr) and is_text(node.value):
            roots.append(node)
        elif isinstance(node, ast.Call):
            roots.extend(identity_arguments(node, aliases))
    return roots


def excluded_ids(tree, aliases):
    return {
        id(node) for root in excluded_roots(tree, aliases) for node in ast.walk(root)
    }


def enclosing(node, parents):
    current = parents.get(id(node))
    while current is not None and not isinstance(current, (ast.stmt, ast.Lambda)):
        current = parents.get(id(current))
    return current


def identifier(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def named_in(scope):
    names = set()
    if scope is None:
        return names
    nested = isinstance(scope, ast.stmt)
    for field, value in ast.iter_fields(scope):
        if nested and field in BODY_FIELDS:
            continue
        for item in value if isinstance(value, list) else [value]:
            if isinstance(item, ast.AST):
                names.update(identifier(child) for child in ast.walk(item))
    return names
