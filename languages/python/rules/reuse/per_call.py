import ast

from checks.common import dotted_name, finding

RULE = "reusable-object-per-call"
SHARED_BUILDERS = {
    "pydantic.TypeAdapter": "TypeAdapter",
    "pydantic.type_adapter.TypeAdapter": "TypeAdapter",
    "jinja2.Environment": "Environment",
    "jinja2.environment.Environment": "Environment",
    "fastjsonschema.compile": "compile",
}
FUNCTION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
SETUP_FUNCTIONS = {"__init__", "__post_init__", "__init_subclass__", "__set_name__", "main"}
CACHING_DECORATORS = {"functools.cache", "functools.lru_cache", "functools.cached_property"}


def enclosing_function(node, context):
    parent = context.parents.get(id(node))
    while parent is not None and not isinstance(parent, FUNCTION_TYPES):
        parent = context.parents.get(id(parent))
    return parent


def decorator_name(decorator, aliases):
    target = decorator.func if isinstance(decorator, ast.Call) else decorator
    return dotted_name(target, aliases) or ""


def runs_once(function, aliases):
    if isinstance(function, ast.Lambda):
        return False
    if function.name in SETUP_FUNCTIONS:
        return True
    return any(
        decorator_name(decorator, aliases) in CACHING_DECORATORS
        for decorator in function.decorator_list
    )


def own_names(function):
    arguments = function.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    names = {argument.arg for argument in every}
    names |= {item.arg for item in (arguments.vararg, arguments.kwarg) if item is not None}
    body = [function.body] if isinstance(function, ast.Lambda) else function.body
    for statement in body:
        for node in ast.walk(statement):
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
                names.add(node.id)
    return names


def outer_names(function):
    if isinstance(function, ast.Lambda):
        return set()
    return {
        name
        for node in ast.walk(function)
        if isinstance(node, (ast.Global, ast.Nonlocal))
        for name in node.names
    }


def depends_on_call(call, function):
    local = own_names(function) - outer_names(function)
    values = list(call.args) + [keyword.value for keyword in call.keywords]
    return any(
        isinstance(node, ast.Name) and node.id in local
        for value in values
        for node in ast.walk(value)
    )


def kept(call, function, context):
    parent = context.parents.get(id(call))
    if isinstance(parent, ast.Return):
        return True
    if not isinstance(parent, (ast.Assign, ast.AnnAssign)):
        return False
    targets = parent.targets if isinstance(parent, ast.Assign) else [parent.target]
    outer = outer_names(function)
    return all(
        isinstance(target, ast.Attribute) or (isinstance(target, ast.Name) and target.id in outer)
        for target in targets
    )


def per_call(call, context):
    function = enclosing_function(call, context)
    return (
        function is not None
        and not runs_once(function, context.aliases)
        and not depends_on_call(call, function)
        and not kept(call, function, context)
    )


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        subject = SHARED_BUILDERS.get(dotted_name(node.func, context.aliases) or "")
        if subject is not None and per_call(node, context):
            found.append(finding(context.path, RULE, subject, node))
    return found
