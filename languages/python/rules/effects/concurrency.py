import ast

from checks.common import dotted_name

COMBINATORS = {"asyncio.gather", "asyncio.wait", "asyncio.as_completed"}
SPAWNERS = {"asyncio.create_task", "asyncio.ensure_future"}
COLLECTING_METHODS = {"append", "add", "extend"}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)


def call_parent(node, parents):
    parent = parents.get(id(node))
    if isinstance(parent, ast.Starred):
        parent = parents.get(id(parent))
    return parent


def is_combinator(node, aliases):
    return isinstance(node, ast.Call) and dotted_name(node.func, aliases) in COMBINATORS


def enclosing_function(node, parents):
    current = parents.get(id(node))
    while current is not None and not isinstance(current, FUNCTIONS):
        current = parents.get(id(current))
    return current


def gathered_names(scope, aliases):
    names = set()
    for node in ast.walk(scope):
        if is_combinator(node, aliases):
            for argument in node.args:
                inner = (
                    argument.value if isinstance(argument, ast.Starred) else argument
                )
                if isinstance(inner, ast.Name):
                    names.add(inner.id)
    return names


def spawns(call, parents, aliases):
    parent = parents.get(id(call))
    if not isinstance(parent, ast.Call) or call not in parent.args:
        return False
    function = parent.func
    return dotted_name(function, aliases) in SPAWNERS or (
        isinstance(function, ast.Attribute) and function.attr == "create_task"
    )


def collected(call, parents, names):
    parent = parents.get(id(call))
    if not isinstance(parent, ast.Call) or call not in parent.args:
        return False
    function = parent.func
    return (
        isinstance(function, ast.Attribute)
        and function.attr in COLLECTING_METHODS
        and isinstance(function.value, ast.Name)
        and function.value.id in names
    )


def assigned_to(loop, parents, names):
    parent = parents.get(id(loop))
    return isinstance(parent, ast.Assign) and any(
        isinstance(t, ast.Name) and t.id in names for t in parent.targets
    )


def is_concurrent(call, loop, context):
    parents, aliases = context.parents, context.aliases
    if is_combinator(call_parent(loop, parents), aliases):
        return True
    if spawns(call, parents, aliases):
        return True
    scope = enclosing_function(call, parents) or context.tree
    names = gathered_names(scope, aliases)
    return collected(call, parents, names) or assigned_to(loop, parents, names)


def map_is_concurrent(call, context):
    return is_combinator(call_parent(call, context.parents), context.aliases)
