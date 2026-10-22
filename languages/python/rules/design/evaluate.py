import ast

from design.annotations import project_type
from design.astutil import first_parameter, own_nodes
from design.classes import enum_cases
from design.imports import resolve_binding
from design.lookup import TRANSPARENT_BASES, attribute_of, find_member, linear, lookup
from design.scope import is_generator
from design.symbols import Function, Klass, ModuleRef, PrefixRef, Variable

CAST_NAMES = {"typing.cast", "typing_extensions.cast"}
CONTEXT_MANAGERS = {"contextlib.contextmanager", "contextlib.asynccontextmanager"}


def typed_function(function):
    return (
        function.plain
        and not is_generator(function)
        and not any(name in CONTEXT_MANAGERS for name in function.decorators)
    )


def return_type(index, function, receiver=None):
    node = function.node.returns
    if node is None or not typed_function(function):
        return None
    owner = receiver if isinstance(receiver, Klass) else function.owner
    return project_type(index, function.module, node, owner)


def entity_value(scope, entity):
    if isinstance(entity, Klass):
        return ("cls", entity)
    if isinstance(entity, Function):
        return ("func", entity, None)
    if isinstance(entity, Variable):
        found = scope.index.variable_type(entity)
        return ("inst", found) if found is not None else None
    if isinstance(entity, (ModuleRef, PrefixRef)):
        return ("mod", entity)
    return None


def local_value(scope, name):
    sites = scope.sites[name]
    if len(sites) == 1 and name in scope.imports:
        entity = resolve_binding(scope.index, scope.imports[name], set())
        return entity_value(scope, entity)
    if name == scope.self_name and len(sites) == 1:
        implicit = scope.function.classmethod or scope.function.name in {
            "__new__",
            "__init_subclass__",
            "__class_getitem__",
        }
        return ("cls", scope.owner) if implicit else ("inst", scope.owner)
    found = scope.local_type(name)
    return ("inst", found) if found is not None else None


def name_value(scope, name):
    if name in scope.sites:
        return local_value(scope, name)
    if name == "super" and scope.owner is not None:
        return ("super", scope.owner)
    return entity_value(scope, lookup(scope.index, scope.module, name))


def super_member(scope, owner, name):
    for entry in linear(scope.index, owner)[1:]:
        if isinstance(entry, Klass):
            if name in entry.members:
                return entry.members[name]
        elif entry not in TRANSPARENT_BASES:
            return None
    return None


def instance_attribute(scope, klass, attribute):
    found = find_member(scope.index, klass, attribute)
    if found is None:
        return None
    function, declaring = found
    if function is None:
        declared = scope.index.attribute_type(declaring, attribute)
        return ("inst", declared) if declared is not None else None
    if function.is_property:
        declared = return_type(scope.index, function, klass)
        return ("inst", declared) if declared is not None else None
    return ("func", function, klass)


def class_attribute(scope, klass, attribute):
    if klass.nested.get(attribute) is not None:
        return ("cls", klass.nested[attribute])
    if attribute in (enum_cases(scope.index, klass) or []):
        return ("inst", klass)
    found = find_member(scope.index, klass, attribute)
    if found is not None and found[0] is not None:
        return ("func", found[0], None)
    return None


def attribute_value(scope, base, attribute):
    kind = base[0]
    if kind == "inst" and isinstance(base[1], Klass):
        return instance_attribute(scope, base[1], attribute)
    if kind == "cls":
        return class_attribute(scope, base[1], attribute)
    if kind == "mod":
        return entity_value(scope, attribute_of(scope.index, base[1], attribute))
    if kind == "super":
        function = super_member(scope, base[1], attribute)
        return ("func", function, base[1]) if function is not None else None
    return None


def cast_type(scope, call):
    from checks.common import dotted_name

    if (
        len(call.args) != 2
        or dotted_name(call.func, scope.module.aliases) not in CAST_NAMES
    ):
        return None
    return project_type(scope.index, scope.module, call.args[0], scope.owner)


def call_value(scope, call, awaited=False):
    cast = cast_type(scope, call)
    if cast is not None:
        return ("inst", cast)
    callee = evaluate(scope, call.func)
    if callee is None:
        return None
    if callee[0] == "cls":
        return ("inst", callee[1])
    if callee[0] == "inst" and isinstance(callee[1], Klass):
        found = find_member(scope.index, callee[1], "__call__")
        callee = ("func", found[0], callee[1]) if found and found[0] else None
    if callee is None or callee[0] != "func" or callee[1].is_async != awaited:
        return None
    declared = return_type(scope.index, callee[1], callee[2])
    return ("inst", declared) if declared is not None else None


def conditional_value(scope, node):
    left, right = evaluate(scope, node.body), evaluate(scope, node.orelse)
    return left if left is not None and left == right else None


def evaluate(scope, node):
    key = id(node)
    if key not in scope.values:
        scope.values[key] = None
        scope.values[key] = compute(scope, node)
    return scope.values[key]


def compute(scope, node):
    if isinstance(node, ast.Name):
        return name_value(scope, node.id)
    if isinstance(node, ast.Attribute):
        base = evaluate(scope, node.value)
        return attribute_value(scope, base, node.attr) if base is not None else None
    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name) and node.func.id == "super":
            return name_value(scope, "super")
        return call_value(scope, node)
    if isinstance(node, ast.Await) and isinstance(node.value, ast.Call):
        return call_value(scope, node.value, awaited=True)
    if isinstance(node, ast.IfExp):
        return conditional_value(scope, node)
    return None


def enter_returns_self(function):
    first = first_parameter(function)
    returns = [n for n in own_nodes(function.node) if isinstance(n, ast.Return)]
    return bool(returns) and all(
        isinstance(r.value, ast.Name) and r.value.id == first for r in returns
    )


def with_value_type(scope, site):
    klass = type_of(scope, site.value)
    if not isinstance(klass, Klass):
        return None
    found = find_member(
        scope.index, klass, "__aenter__" if site.asynchronous else "__enter__"
    )
    if not found or found[0] is None:
        return None
    if enter_returns_self(found[0]):
        return klass
    if site.asynchronous:
        return None
    return return_type(scope.index, found[0], klass)


def type_of(scope, node):
    value = evaluate(scope, node)
    if value is not None and value[0] == "inst":
        return value[1]
    return None
