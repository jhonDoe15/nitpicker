import ast
import builtins

from checks.common import last_name
from security.resolve.scopes import definition, module_where

MAX_HOPS = 4
SUFFIXES = ("Error", "Exception", "Warning")
FORMATTING_EXCEPTIONS = {"ValidationError", "PydanticCustomError"}
CUSTOM_FORMATTING = {"__init__", "__str__"}


def builtin_exception(name):
    found = getattr(builtins, name, None)
    return isinstance(found, type) and issubclass(found, BaseException)


def formats_itself(cls):
    return any(
        isinstance(item, ast.FunctionDef) and item.name in CUSTOM_FORMATTING
        for item in cls.body
    )


def base_classes(cls, context):
    where = module_where(context)
    found = [definition(base, where) for base in cls.bases]
    return [(item[0], item[1].context) for item in found if item and item[0] is not cls]


def formats_anywhere(cls, context, hops=0):
    if formats_itself(cls):
        return True
    if hops > MAX_HOPS:
        return False
    return any(
        formats_anywhere(base, place, hops + 1)
        for base, place in base_classes(cls, context)
    )


def reaches_builtin(cls, context, hops=0):
    if hops > MAX_HOPS:
        return False
    if any(builtin_exception(last_name(base) or "") for base in cls.bases):
        return True
    return any(
        reaches_builtin(base, place, hops + 1)
        for base, place in base_classes(cls, context)
    )


def plain_class(cls, context):
    return not formats_anywhere(cls, context) and reaches_builtin(cls, context)


def is_plain_exception_call(call, context):
    func = call.func
    if not isinstance(func, (ast.Name, ast.Attribute)):
        return False
    name = last_name(func)
    if name in FORMATTING_EXCEPTIONS:
        return False
    found = definition(func, module_where(context))
    if found is not None:
        return plain_class(found[0], found[1].context)
    if isinstance(func, ast.Name) and builtin_exception(name):
        return True
    return name.endswith(SUFFIXES) and name[:1].isupper()
