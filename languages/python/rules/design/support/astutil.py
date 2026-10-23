import ast

SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
STORE_CONTEXTS = (ast.Store, ast.Del)


def chain(node):
    attributes = []
    while isinstance(node, ast.Attribute):
        attributes.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        return node.id, attributes[::-1]
    return None


def chain_text(node):
    found = chain(node)
    return ".".join([found[0], *found[1]]) if found else None


def constant_text(node):
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        inner = constant_text(node.operand)
        return f"-{inner}" if inner and inner[0].isdigit() else None
    if not isinstance(node, ast.Constant):
        return None
    value = node.value
    if value is None or isinstance(value, (bool, int, float)):
        return str(value)
    return value if isinstance(value, str) else None


def own_nodes(root):
    cached = getattr(root, "own_cache", None)
    if cached is None:
        cached = list(ast.iter_child_nodes(root))
        for node in cached:
            if not isinstance(node, SCOPES):
                cached.extend(ast.iter_child_nodes(node))
        root.own_cache = cached
    return cached


def all_nodes(root):
    cached = getattr(root, "all_cache", None)
    if cached is None:
        cached = list(ast.walk(root))
        root.all_cache = cached
    return cached


def position(node):
    return (node.lineno, node.col_offset)


def call_line(call):
    func = call.func
    return func.end_lineno if isinstance(func, ast.Attribute) else call.lineno


def first_parameter(function):
    arguments = function.node.args
    positional = arguments.posonlyargs + arguments.args
    return positional[0].arg if positional else None


def body_without_docstring(body):
    first = body[0] if body else None
    if (
        isinstance(first, ast.Expr)
        and isinstance(first.value, ast.Constant)
        and isinstance(first.value.value, str)
    ):
        return body[1:]
    return body
