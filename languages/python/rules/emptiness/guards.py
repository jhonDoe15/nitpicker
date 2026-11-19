import ast

from signatures.annotations import FUNCTION_TYPES

HANDLED = {
    "ValueError",
    "IndexError",
    "LookupError",
    "Exception",
    "BaseException",
}
EXITS = (ast.Return, ast.Raise, ast.Continue, ast.Break)
BRANCHES = (ast.If, ast.IfExp, ast.While)
COMPREHENSIONS = (ast.ListComp, ast.GeneratorExp, ast.SetComp)
COMPREHENSION_PARENTS = (ast.ListComp, ast.GeneratorExp, ast.SetComp, ast.DictComp)


def mentions(node, name):
    names = name if isinstance(name, set) else {name}
    return any(
        isinstance(inner, ast.Name) and inner.id in names for inner in ast.walk(node)
    )


def is_length_of(node, name):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "len"
        and any(mentions(argument, name) for argument in node.args)
    )


def length_names(function, name):
    found = {name}
    for node in ast.walk(function):
        is_alias = (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and any(is_length_of(inner, name) for inner in ast.walk(node.value))
        )
        if is_alias:
            found.add(node.targets[0].id)
    return found


def handler_names(handler):
    if handler.type is None:
        return {"Exception"}
    types = handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    return {
        item.id if isinstance(item, ast.Name) else getattr(item, "attr", "")
        for item in types
    }


def catches(node, child):
    return child in node.body and any(
        handler_names(handler) & HANDLED for handler in node.handlers
    )


def preceding(child, parent):
    for _, value in ast.iter_fields(parent):
        if isinstance(value, list) and child in value:
            return value[: value.index(child)]
    return []


def binds_name(statements, name):
    return any(
        isinstance(node, ast.Name)
        and node.id == name
        and isinstance(node.ctx, ast.Store)
        for statement in statements
        for node in ast.walk(statement)
    )


def settles(statement, name):
    if isinstance(statement, ast.Assert):
        return mentions(statement.test, name)
    if isinstance(statement, ast.If) and mentions(statement.test, name):
        ends = bool(statement.body) and isinstance(statement.body[-1], EXITS)
        return ends or binds_name(statement.body, name)
    return False


def settles_exit(statement):
    return bool(statement.body) and isinstance(statement.body[-1], EXITS)


def boolean_guard(parent, child, name):
    if not isinstance(parent, ast.BoolOp) or child not in parent.values:
        return False
    before = parent.values[: parent.values.index(child)]
    return any(mentions(value, name) for value in before)


def comprehension_guard(parent, name):
    if not isinstance(parent, COMPREHENSION_PARENTS):
        return False
    return any(
        mentions(generator.iter, name)
        or any(mentions(test, name) for test in generator.ifs)
        for generator in parent.generators
    )


def is_guard_step(parent, child, name):
    if isinstance(parent, BRANCHES) and child is not parent.test:
        return mentions(parent.test, name)
    if isinstance(parent, (ast.For, ast.AsyncFor)) and child is not parent.iter:
        return mentions(parent.iter, name)
    if isinstance(parent, ast.Try) and catches(parent, child):
        return True
    if isinstance(parent, ast.Match) and child is not parent.subject:
        return mentions(parent.subject, name)
    return boolean_guard(parent, child, name) or comprehension_guard(parent, name)


def function_of(node, context):
    parent = context.parents.get(id(node))
    while parent is not None and not isinstance(parent, FUNCTION_TYPES):
        parent = context.parents.get(id(parent))
    return parent


def is_guarded(node, name, context):
    function = function_of(node, context)
    if function is not None:
        name = length_names(function, name)
    child, parent = node, context.parents.get(id(node))
    while parent is not None:
        if is_guard_step(parent, child, name):
            return True
        if any(settles(item, name) for item in preceding(child, parent)):
            return True
        if isinstance(parent, FUNCTION_TYPES):
            return False
        child, parent = parent, context.parents.get(id(parent))
    return False


def comprehension_sources(node):
    return {
        ast.unparse(inner.generators[0].iter)
        for inner in ast.walk(node)
        if isinstance(inner, COMPREHENSIONS) and inner.generators
    }


def tests_same_source(value, statement):
    return isinstance(statement, ast.If) and bool(
        comprehension_sources(value) & comprehension_sources(statement.test)
    )


def is_caught(node, context, value=None):
    child, parent = node, context.parents.get(id(node))
    while parent is not None:
        if isinstance(parent, ast.Try) and catches(parent, child):
            return True
        if value is not None and any(
            tests_same_source(value, item) and settles_exit(item)
            for item in preceding(child, parent)
        ):
            return True
        if isinstance(parent, FUNCTION_TYPES):
            return False
        child, parent = parent, context.parents.get(id(parent))
    return False
