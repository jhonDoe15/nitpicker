import ast
from collections import namedtuple

from checks.common import dotted_name
from security.resolve.scopes import MAX_HOPS, definition, module_where

BatchFunction = namedtuple("BatchFunction", "owner name function keys")
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
LOADER_ROOTS = ("promise", "aiodataloader", "strawberry", "dataloader")
BATCH_METHODS = {"batch_load_fn", "batch_load"}
BATCH_KEYWORDS = {"load_fn", "batch_load_fn"}


def is_loader_path(path):
    if not path or path.split(".")[0] not in LOADER_ROOTS:
        return False
    return path.rsplit(".", 1)[-1] == "DataLoader"


def is_loader_class(cls, context, hops=0):
    if hops > MAX_HOPS:
        return False
    for base in cls.bases:
        if is_loader_path(dotted_name(base, context.aliases)):
            return True
        found = definition(base, module_where(context))
        if found is not None and found[0] is not cls:
            if is_loader_class(found[0], found[1].context, hops + 1):
                return True
    return False


def keys_parameter(function, is_method):
    arguments = function.args.posonlyargs + function.args.args
    names = [argument.arg for argument in arguments]
    names = names[1:] if is_method else names
    return names[0] if names else None


def class_batches(cls, context):
    if not is_loader_class(cls, context):
        return
    for statement in cls.body:
        if isinstance(statement, FUNCTIONS) and statement.name in BATCH_METHODS:
            keys = keys_parameter(statement, True)
            if keys:
                yield BatchFunction(cls.name, statement.name, statement, keys)


def passed_function(call):
    candidates = [
        keyword.value for keyword in call.keywords if keyword.arg in BATCH_KEYWORDS
    ]
    candidates += call.args[:1]
    return next((item for item in candidates if isinstance(item, ast.Name)), None)


def call_batches(call, context):
    if not is_loader_path(dotted_name(call.func, context.aliases)):
        return
    reference = passed_function(call)
    where = module_where(context)
    found = definition(reference, where, FUNCTIONS) if reference else None
    keys = keys_parameter(found[0], False) if found else None
    if keys:
        yield BatchFunction(found[0].name, found[0].name, found[0], keys)


def batch_functions(context):
    for node in ast.walk(context.tree):
        if isinstance(node, ast.ClassDef):
            yield from class_batches(node, context)
        elif isinstance(node, ast.Call):
            yield from call_batches(node, context)
