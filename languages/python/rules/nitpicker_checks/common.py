import ast

TEST_DIRECTORIES = {"tests", "test"}
FUNCTION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef)
SCOPE_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)


def is_test_path(path):
    parts = path.split("/")
    name = parts[-1]
    return (
        bool(TEST_DIRECTORIES.intersection(parts[:-1]))
        or name.startswith("test_")
        or name.endswith("_test.py")
        or name == "conftest.py"
    )


def import_aliases(tree):
    names, modules = {}, {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            for alias in node.names:
                names[alias.asname or alias.name] = f"{node.module}.{alias.name}"
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.asname:
                    modules[alias.asname] = alias.name
    return names, modules


def dotted_name(node, aliases):
    names, modules = aliases
    if isinstance(node, ast.Name):
        return names.get(node.id) or modules.get(node.id) or node.id
    if isinstance(node, ast.Attribute):
        base = dotted_name(node.value, aliases)
        return f"{base}.{node.attr}" if base else None
    return None


def decorator_name(decorator, aliases):
    target = decorator.func if isinstance(decorator, ast.Call) else decorator
    name = dotted_name(target, aliases)
    return name.rsplit(".", 1)[-1] if name else None


def last_segment(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def same_node(left, right):
    if left is None or right is None:
        return left is right
    return ast.dump(left) == ast.dump(right)


def body_without_docstring(body):
    first = body[0] if body else None
    is_docstring = (
        isinstance(first, ast.Expr)
        and isinstance(first.value, ast.Constant)
        and isinstance(first.value.value, str)
    )
    return body[1:] if is_docstring else body


def scoped_definitions(tree):
    found = []
    pending = [(child, ()) for child in tree.body]
    while pending:
        node, scope = pending.pop()
        children = list(ast.iter_child_nodes(node))
        if isinstance(node, SCOPE_TYPES):
            scope = scope + (node.name,)
            found.append((node, scope))
        pending.extend((child, scope) for child in reversed(children))
    return found


def finding(rule, path, subject, line, data=None):
    entry = {"rule": rule, "path": path, "subject": subject, "line": line}
    if data is not None:
        entry["data"] = data
    return entry
