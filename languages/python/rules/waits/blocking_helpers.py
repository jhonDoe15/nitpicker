import ast

from checks.common import dotted_name, finding, own_nodes
from security.resolve.scopes import (
    definition,
    enclosing_class,
    imported_where,
    module_where,
    where_of,
)
from security.support import exempt

RULE = "blocking-helper-in-async"
GUARDED = True
HOPS = 2
VERBS = ("get", "post", "put", "patch", "delete", "head", "options", "request")
BLOCKING = {f"{library}.{verb}" for library in ("requests", "httpx") for verb in VERBS}
BLOCKING |= {"urllib.request.urlopen", "time.sleep", "os.system"}
BLOCKING |= {f"subprocess.{name}" for name in ("run", "call", "check_call", "check_output")}
PLAIN_DECORATORS = {"staticmethod", "classmethod"}


def plain(function):
    return all(
        isinstance(item, ast.Name) and item.id in PLAIN_DECORATORS
        for item in function.decorator_list
    )


def is_generator(function):
    return any(isinstance(node, (ast.Yield, ast.YieldFrom)) for node in own_nodes(function))


def local_names(function):
    arguments = function.args
    names = {
        argument.arg
        for argument in arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    }
    names |= {item.arg for item in (arguments.vararg, arguments.kwarg) if item is not None}
    for node in own_nodes(function):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            names.add(node.name)
    return names


def root_name(node):
    while isinstance(node, (ast.Attribute, ast.Call, ast.Subscript)):
        node = node.func if isinstance(node, ast.Call) else node.value
    return node.id if isinstance(node, ast.Name) else None


def shadowed(call, context):
    name = root_name(call.func)
    if name in {"self", "cls"}:
        return False
    current = context.parents.get(id(call))
    while current is not None:
        if isinstance(current, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if name in local_names(current):
                return True
        current = context.parents.get(id(current))
    return False


def last_binding(name, where):
    found = None
    for statement in where.context.tree.body:
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if statement.name == name:
                found = statement
        elif any(
            isinstance(node, ast.Name) and node.id == name and isinstance(node.ctx, ast.Store)
            for node in ast.walk(statement)
        ):
            found = statement
    return found


def module_function(name, where, hops=0):
    found = last_binding(name, where)
    if isinstance(found, ast.FunctionDef):
        return found, module_where(where.context)
    if found is None and hops < HOPS:
        imported = imported_where(name, where)
        if imported is not None:
            return module_function(imported[1], imported[0], hops + 1)
    return None


def module_class(name, where):
    found = last_binding(name, where)
    return found if isinstance(found, ast.ClassDef) else None


def class_method(owner, name, where, seen=()):
    if owner is None or id(owner) in seen:
        return None
    for statement in reversed(owner.body):
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)) and statement.name == name:
            if isinstance(statement, ast.FunctionDef):
                return statement, where_of(statement, where.context)
            return None
    for base in owner.bases:
        if isinstance(base, ast.Name):
            found = class_method(module_class(base.id, where), name, where, (*seen, id(owner)))
            if found is not None:
                return found
    return None


def method_of(call, where):
    func = call.func
    if not (isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name)):
        return None
    owner = func.value.id
    if owner in {"self", "cls"}:
        cls = enclosing_class(call, where.context)
    else:
        cls = module_class(owner, where)
    return class_method(cls, func.attr, where)


def callee(call, where):
    if isinstance(call.func, ast.Name):
        found = module_function(call.func.id, where)
    elif method_of(call, where) is not None:
        found = method_of(call, where)
    else:
        found = definition(call.func, where, kinds=(ast.FunctionDef,))
    if found is None or not plain(found[0]) or is_generator(found[0]):
        return None
    return found


def is_blocking(call, name):
    if name not in BLOCKING:
        return False
    zero = call.args[:1] and isinstance(call.args[0], ast.Constant) and call.args[0].value == 0
    return not (name == "time.sleep" and zero)


def blocking_reached(function, place, hops):
    for node in own_nodes(function):
        if not isinstance(node, ast.Call) or shadowed(node, place.context):
            continue
        if is_blocking(node, dotted_name(node.func, place.context.aliases)):
            return dotted_name(node.func, place.context.aliases)
        found = callee(node, where_of(node, place.context)) if hops > 0 else None
        if found is not None and found[0] is not function:
            reached = blocking_reached(found[0], found[1], hops - 1)
            if reached is not None:
                return reached
    return None


def problem(call, context):
    if shadowed(call, context):
        return None
    found = callee(call, where_of(call, context))
    if found is None:
        return None
    reached = blocking_reached(found[0], found[1], HOPS)
    return None if reached is None else f"{found[0].name} calls {reached}"


def check(context):
    if exempt(context):
        return []
    found = []
    seen = set()
    for function in ast.walk(context.tree):
        if not isinstance(function, ast.AsyncFunctionDef):
            continue
        for node in own_nodes(function):
            subject = problem(node, context) if isinstance(node, ast.Call) else None
            if subject is not None and (node.lineno, subject) not in seen:
                seen.add((node.lineno, subject))
                found.append(finding(context.path, RULE, subject, node))
    return found
