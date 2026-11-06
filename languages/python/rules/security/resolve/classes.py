import ast

from checks.common import dotted_name
from security.resolve.scopes import (
    FUNCTIONS,
    MAX_HOPS,
    Where,
    base_names,
    definition,
    enclosing_class,
    lookup,
    module_where,
    scope_of,
)

FIELD_CALLS = {"field", "Field", "ib", "attrib"}
SELF_TYPE = "type"


class ClassFacts:
    def __init__(self):
        self.values = {}
        self.annotations = {}
        self.methods = {}

    def add(self, name, value, scope):
        if value is not None:
            self.values.setdefault(name, []).append((value, scope))


def field_value(value):
    if not isinstance(value, ast.Call):
        return value
    name = (dotted_name(value.func, ({}, {})) or "").rsplit(".", 1)[-1]
    if name not in FIELD_CALLS:
        return value
    for item in value.keywords:
        if item.arg in {"default_factory", "factory"}:
            call = ast.Call(func=item.value, args=[], keywords=[])
            return ast.copy_location(call, value)
        if item.arg == "default":
            return item.value
    return value.args[0] if value.args and name == "Field" else None


def owner_name(method):
    every = method.args.posonlyargs + method.args.args
    return every[0].arg if every else None


def add_instance_writes(facts, method):
    owner = owner_name(method)
    for node in ast.walk(method):
        if isinstance(node, ast.Assign):
            targets, value = node.targets, node.value
        elif isinstance(node, (ast.AnnAssign, ast.AugAssign)):
            targets, value = [node.target], node.value
        else:
            continue
        for target in targets:
            if (
                isinstance(target, ast.Attribute)
                and isinstance(target.value, ast.Name)
                and target.value.id == owner
            ):
                facts.add(target.attr, value, method)
                if isinstance(node, ast.AnnAssign):
                    facts.annotations.setdefault(target.attr, node.annotation)


def build_facts(cls):
    facts = ClassFacts()
    for statement in cls.body:
        if isinstance(statement, ast.Assign):
            for target in statement.targets:
                if isinstance(target, ast.Name):
                    facts.add(target.id, statement.value, None)
        elif isinstance(statement, ast.AnnAssign) and isinstance(
            statement.target, ast.Name
        ):
            facts.annotations[statement.target.id] = statement.annotation
            facts.add(statement.target.id, field_value(statement.value), None)
        elif isinstance(statement, FUNCTIONS):
            facts.methods.setdefault(statement.name, statement)
            add_instance_writes(facts, statement)
    return facts


def class_facts(cls, context):
    key = ("security-class", context.path, id(cls))
    return context.project.memo(key, lambda _: build_facts(cls))


def subclass_index(project):
    index = {}
    for context in project.contexts.values():
        for node in ast.walk(context.tree):
            if isinstance(node, ast.ClassDef):
                for name in base_names(node):
                    index.setdefault(name, []).append((node, context))
    return index


def bases_of(cls, where):
    found = []
    for base in cls.bases:
        resolved = definition(base, where)
        if resolved is not None and resolved[0] is not cls:
            found.append(resolved)
    return found


def own_entries(facts, name, context):
    return [
        (value, Where(context, scope) if scope is not None else module_where(context))
        for value, scope in facts.values.get(name, [])
    ]


def inherited(cls, where, name, hops=0):
    entries = own_entries(class_facts(cls, where.context), name, where.context)
    if entries or hops > MAX_HOPS:
        return entries
    for base, place in bases_of(cls, where):
        entries = inherited(base, place, name, hops + 1)
        if entries:
            return entries
    return []


def overrides(cls, context, name):
    index = context.project.memo("security-subclasses", subclass_index)
    found = []
    for subclass, other in index.get(cls.name, []):
        bases = bases_of(subclass, module_where(other))
        if subclass is not cls and any(base is cls for base, _ in bases):
            found.extend(own_entries(class_facts(subclass, other), name, other))
    return found


def is_self(node, context):
    if isinstance(node, ast.Call):
        function = node.func
        if isinstance(function, ast.Name) and function.id == SELF_TYPE and node.args:
            return is_self(node.args[0], context)
        return False
    method = scope_of(node, context)
    if not isinstance(node, ast.Name) or not isinstance(method, FUNCTIONS):
        return False
    owner = context.parents.get(id(method))
    return isinstance(owner, ast.ClassDef) and owner_name(method) == node.id


def root_is_import(node, aliases):
    while isinstance(node, ast.Attribute):
        node = node.value
    return isinstance(node, ast.Name) and (
        node.id in aliases[0] or node.id in aliases[1]
    )


def receiver_class(node, where):
    if is_self(node, where.context):
        cls = enclosing_class(node, where.context)
        return (cls, module_where(where.context), True) if cls is not None else None
    if isinstance(node, (ast.Name, ast.Attribute)):
        found = definition(node, where)
        if found is not None:
            return found[0], found[1], False
    return None


def module_attribute(node, where):
    if not root_is_import(node, where.context.aliases):
        return None
    dotted = dotted_name(node, where.context.aliases)
    located = where.context.project.locate(dotted) if dotted else None
    other = located and where.context.project.contexts.get(located[0])
    if other is None:
        return None
    entries = lookup(located[1], module_where(other))
    return [(value, place) for kind, value, place in entries if kind == "value"]


def attribute_values(node, where):
    if not isinstance(node, ast.Attribute):
        return None
    owner = receiver_class(node.value, where)
    if owner is not None:
        cls, place, instance = owner
        entries = inherited(cls, place, node.attr)
        if instance:
            entries = entries + overrides(cls, place.context, node.attr)
        return entries or None
    return module_attribute(node, where)


def annotation_class(annotation, where):
    if isinstance(annotation, ast.Constant) and isinstance(annotation.value, str):
        try:
            annotation = ast.parse(annotation.value, mode="eval").body
        except (SyntaxError, ValueError):
            return None
    if isinstance(annotation, ast.BinOp) and isinstance(annotation.op, ast.BitOr):
        left = annotation_class(annotation.left, where)
        return left or annotation_class(annotation.right, where)
    if isinstance(annotation, ast.Subscript):
        name = (dotted_name(annotation.value, where.context.aliases) or "").rsplit(
            ".", 1
        )[-1]
        return annotation_class(annotation.slice, where) if name == "Optional" else None
    return definition(annotation, where) if annotation is not None else None


def instance_classes(node, where, depth=0):
    if depth > MAX_HOPS or node is None:
        return []
    if isinstance(node, ast.Call):
        found = (
            definition(node.func, where)
            if not isinstance(node.func, ast.Call)
            else None
        )
        return [found] if found is not None else []
    if isinstance(node, ast.Name):
        found = []
        for kind, value, place in lookup(node.id, where):
            if kind == "param":
                typed = annotation_class(value, place)
                found.extend([typed] if typed is not None else [])
            elif kind == "value":
                found.extend(instance_classes(value, place, depth + 1))
        return found
    if isinstance(node, ast.Attribute):
        found = []
        for value, place in attribute_values(node, where) or []:
            found.extend(instance_classes(value, place, depth + 1))
        return found
    return []


def method_named(cls, place, name, hops=0):
    method = class_facts(cls, place.context).methods.get(name)
    if method is not None:
        return method, Where(place.context, scope_of(method, place.context))
    if hops > MAX_HOPS:
        return None
    for base, base_place in bases_of(cls, place):
        found = method_named(base, base_place, name, hops + 1)
        if found is not None:
            return found
    return None


def function_of(call, where):
    function = call.func
    if not isinstance(function, ast.Attribute):
        return definition(function, where, FUNCTIONS)
    if is_self(function.value, where.context):
        cls = enclosing_class(function.value, where.context)
        return (
            method_named(cls, module_where(where.context), function.attr)
            if cls
            else None
        )
    for cls, place in instance_classes(function.value, where):
        found = method_named(cls, place, function.attr)
        if found is not None:
            return found
    return definition(function, where, FUNCTIONS)


def bind_arguments(call, function, where):
    parameters = function.args.posonlyargs + function.args.args
    if parameters and parameters[0].arg in {"self", "cls"}:
        if isinstance(call.func, ast.Attribute):
            parameters = parameters[1:]
    bound = {}
    for parameter, value in zip(parameters, call.args):
        if isinstance(value, ast.Starred):
            break
        bound[parameter.arg] = ("value", value, where)
    for item in call.keywords:
        if item.arg is not None:
            bound[item.arg] = ("value", item.value, where)
    return bound
