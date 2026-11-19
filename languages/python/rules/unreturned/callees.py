import ast

from checks.common import functions_of
from security.resolve.classes import bases_of, class_facts
from security.resolve.scopes import (
    FUNCTIONS,
    definition,
    enclosing_class,
    is_enum_class,
    module_where,
)
from unreturned.annotations import result_names

SELF_NAMES = {"self", "cls"}
NEUTRAL_DECORATORS = {"staticmethod", "classmethod", "abstractmethod", "override"}
MAX_HOPS = 4


def plain_decorators(function):
    names = {
        (item.id if isinstance(item, ast.Name) else getattr(item, "attr", ""))
        for item in function.decorator_list
    }
    return names <= NEUTRAL_DECORATORS


def returns_self(function):
    for node in ast.walk(function):
        if isinstance(node, ast.Return) and isinstance(node.value, ast.Name):
            if node.value.id in SELF_NAMES:
                return True
    return False


def method_in(cls, context, name, hops=0):
    found = class_facts(cls, context).methods.get(name)
    if found is not None or hops > MAX_HOPS:
        return (found, context) if found is not None else None
    for base, place in bases_of(cls, module_where(context)):
        located = method_in(base, place.context, name, hops + 1)
        if located is not None:
            return located
    return None


def has_unresolved_base(cls, context):
    where = module_where(context)
    return any(definition(base, where) is None for base in cls.bases)


def is_self_call(call, context):
    owner = call.func.value if isinstance(call.func, ast.Attribute) else None
    return isinstance(owner, ast.Name) and owner.id in SELF_NAMES


def target_of(call, context):
    where = module_where(context)
    if isinstance(call.func, ast.Name):
        found = definition(call.func, where, kinds=FUNCTIONS)
        return (found[0], found[1].context) if found else None
    if is_self_call(call, context):
        cls = enclosing_class(call, context)
        return method_in(cls, context, call.func.attr) if cls is not None else None
    if isinstance(call.func, ast.Attribute) and not is_enum_class(
        call.func.value, where
    ):
        found = definition(call.func, where, kinds=FUNCTIONS)
        return (found[0], found[1].context) if found else None
    return None


def returns_parameter(function):
    names = {
        argument.arg
        for argument in ast.walk(function.args)
        if isinstance(argument, ast.arg)
    }
    return any(
        isinstance(node, ast.Return)
        and isinstance(node.value, ast.Name)
        and node.value.id in names
        for node in ast.walk(function)
    )


def declared_type(function, context):
    if (
        not plain_decorators(function)
        or returns_self(function)
        or returns_parameter(function)
    ):
        return None
    return result_names(function.returns, context.aliases)


def unwrapped(node):
    return node.value if isinstance(node, ast.Await) else node


def returned_evidence(project):
    found = {}
    for context in project.contexts.values():
        for function in functions_of(context.tree):
            names = result_names(function.returns, context.aliases)
            for node in ast.walk(function):
                call = (
                    unwrapped(node.value)
                    if isinstance(node, ast.Return) and node.value
                    else None
                )
                if names and isinstance(call, ast.Call) and is_self_call(call, context):
                    found.setdefault(call.func.attr, set()).add(names)
    return {name: next(iter(kinds)) for name, kinds in found.items() if len(kinds) == 1}


def call_type(call, context):
    located = target_of(call, context)
    if located is not None:
        return declared_type(*located)
    if not is_self_call(call, context):
        return None
    cls = enclosing_class(call, context)
    if cls is None or not has_unresolved_base(cls, context):
        return None
    return context.project.memo("unreturned-evidence", returned_evidence).get(
        call.func.attr
    )
