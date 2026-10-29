import abc
import ast
import builtins
import enum
import typing

from checks.common import dotted_name

FUNCTION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef)
NESTED_BLOCKS = (
    ast.If,
    ast.Try,
    getattr(ast, "TryStar", ast.Try),
    ast.With,
    ast.AsyncWith,
    ast.For,
    ast.AsyncFor,
    ast.While,
)
NEUTRAL_MODULES = {"", "builtins", "abc", "enum", "typing", "typing_extensions"}
ENUM_HOOKS = {"_missing_", "_generate_next_value_", "_ignore_", "_order_", "name", "value"}
NEUTRAL_MEMBERS = {
    "object": set(dir(object)),
    "ABC": set(dir(abc.ABC)),
    "Generic": set(dir(typing.Generic)),
    "Enum": set(dir(enum.Enum)) | ENUM_HOOKS,
    "IntEnum": set(dir(enum.IntEnum)) | ENUM_HOOKS,
    "StrEnum": set(dir(str)) | ENUM_HOOKS,
    "Flag": set(dir(enum.Flag)) | ENUM_HOOKS,
    "IntFlag": set(dir(enum.IntFlag)) | ENUM_HOOKS,
    "NamedTuple": set(dir(tuple))
    | {"_asdict", "_replace", "_make", "_fields", "_field_defaults"},
    "TypedDict": set(dir(dict)),
}


def statements_of(body):
    for statement in body:
        if isinstance(statement, NESTED_BLOCKS):
            nested = [statement.body, getattr(statement, "orelse", [])]
            nested += [handler.body for handler in getattr(statement, "handlers", [])]
            nested.append(getattr(statement, "finalbody", []))
            for block in nested:
                yield from statements_of(block)
        else:
            yield statement


def bound_names(statement):
    if isinstance(statement, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
        targets = (
            statement.targets if isinstance(statement, ast.Assign) else [statement.target]
        )
        return [target.id for target in targets if isinstance(target, ast.Name)]
    return []


def class_methods(node):
    cached = getattr(node, "nitpicker_methods", None)
    if cached is not None:
        return cached
    methods = {}
    for statement in statements_of(node.body):
        names = (
            [statement.name]
            if isinstance(statement, FUNCTION_TYPES)
            else bound_names(statement)
        )
        for name in names:
            methods.setdefault(name, []).append(statement)
    node.nitpicker_methods = methods
    return methods


def base_node(base):
    return base.value if isinstance(base, ast.Subscript) else base


def builtin_members(dotted):
    module, _, last = dotted.rpartition(".")
    if module not in NEUTRAL_MODULES:
        return None
    if last in NEUTRAL_MEMBERS:
        return NEUTRAL_MEMBERS[last]
    builtin = getattr(builtins, last, None)
    if isinstance(builtin, type) and issubclass(builtin, BaseException):
        return set(dir(builtin))
    return None


def top_level_classes(tree):
    cached = getattr(tree, "nitpicker_classes", None)
    if cached is None:
        cached = {}
        for statement in tree.body:
            if isinstance(statement, ast.ClassDef):
                cached.setdefault(statement.name, statement)
        tree.nitpicker_classes = cached
    return cached


def local_class(context, name):
    found = top_level_classes(context.tree).get(name)
    return (context, found) if found is not None else None


def project_class(context, dotted):
    located = context.project.locate(dotted)
    owner = context.project.contexts.get(located[0]) if located else None
    return local_class(owner, located[1]) if owner else None


def resolve_base(context, base):
    node = base_node(base)
    dotted = dotted_name(node, context.aliases)
    if isinstance(node, ast.Name) and local_class(context, node.id):
        return local_class(context, node.id)
    return project_class(context, dotted) if dotted else None


def inherited_names(context, node):
    names, complete = set(), True
    seen = {id(node)}
    pending = [(context, node)]
    while pending:
        owner, current = pending.pop()
        extra = [keyword for keyword in current.keywords if keyword.arg != "metaclass"]
        complete = complete and not extra
        for base in current.bases:
            resolved = resolve_base(owner, base)
            if resolved is None:
                dotted = dotted_name(base_node(base), owner.aliases) or ""
                members = builtin_members(dotted)
                names |= members or set()
                complete = complete and members is not None
            elif id(resolved[1]) not in seen:
                seen.add(id(resolved[1]))
                names |= set(class_methods(resolved[1]))
                pending.append(resolved)
    return names, complete
