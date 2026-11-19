import ast

from checks.common import last_name
from overrides.hierarchy import FUNCTIONS

SKIPPED_DECORATORS = {
    "staticmethod",
    "abstractmethod",
    "overload",
    "setter",
    "deleter",
    "getter",
}


def decorator_names(method):
    return {
        last_name(item.func if isinstance(item, ast.Call) else item)
        for item in method.decorator_list
    }


def without_docstring(body):
    first = body[0] if body else None
    is_text = (
        isinstance(first, ast.Expr)
        and isinstance(first.value, ast.Constant)
        and isinstance(first.value.value, str)
    )
    return body[1:] if is_text else body


def is_inert(statement):
    if isinstance(statement, (ast.Pass, ast.Raise)):
        return True
    if isinstance(statement, ast.Expr):
        return isinstance(statement.value, ast.Constant)
    if isinstance(statement, ast.Return):
        return statement.value is None or isinstance(statement.value, ast.Constant)
    return False


def is_trivial(method):
    body = without_docstring(method.body)
    return all(is_inert(statement) for statement in body)


def is_overridable(method):
    return not (decorator_names(method) & SKIPPED_DECORATORS)


def is_super_call(node):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "super"
    )


def receiver_names(cls, ancestors, libraries):
    names = {item.name for item, _ in ancestors}
    names.update(dotted.rsplit(".", 1)[-1] for dotted in libraries)
    for base in cls.bases:
        names.add(last_name(base.value if isinstance(base, ast.Subscript) else base))
    names.discard(None)
    return names


def super_aliases(method):
    return {
        target.id
        for node in ast.walk(method)
        if isinstance(node, ast.Assign) and is_super_call(node.value)
        for target in node.targets
        if isinstance(target, ast.Name)
    }


def reaches_base(node, receivers, aliases):
    if is_super_call(node):
        return True
    name = last_name(node)
    return name is not None and (name in receivers or name in aliases)


def is_getattr_of(node, name, receivers, aliases):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "getattr"
        and len(node.args) > 1
        and isinstance(node.args[1], ast.Constant)
        and node.args[1].value == name
        and reaches_base(node.args[0], receivers, aliases)
    )


def calls_base(method, name, extras, receivers):
    aliases = super_aliases(method)
    for node in ast.walk(method):
        if is_getattr_of(node, name, receivers, aliases):
            return True
        if not isinstance(node, ast.Attribute):
            continue
        if node.attr == name or node.attr in extras:
            if reaches_base(node.value, receivers, aliases):
                return True
        if node.attr in extras and last_name(node.value) in {"self", "cls"}:
            return True
    return False
