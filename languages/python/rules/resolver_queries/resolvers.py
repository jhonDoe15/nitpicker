import ast

from checks.common import dotted_name

STRAWBERRY = "strawberry"
GRAPHENE = "graphene"
TYPE_DECORATORS = {"type", "interface"}
FIELD_DECORATOR = "field"
OBJECT_TYPE = "ObjectType"
RESOLVER_PREFIX = "resolve_"
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


class Resolver:
    def __init__(self, parent, name, function, framework):
        self.parent = parent
        self.name = name
        self.function = function
        self.framework = framework


def decorator_path(decorator, context):
    target = decorator.func if isinstance(decorator, ast.Call) else decorator
    return dotted_name(target, context.aliases) or ""


def is_strawberry(path, names):
    return (
        path.split(".")[0].startswith(STRAWBERRY) and path.rsplit(".", 1)[-1] in names
    )


def is_strawberry_type(cls, context):
    return any(
        is_strawberry(decorator_path(item, context), TYPE_DECORATORS)
        for item in cls.decorator_list
    )


def is_graphene_type(cls, context):
    if not imports_package(context, GRAPHENE):
        return False
    for base in cls.bases:
        path = dotted_name(base, context.aliases) or ""
        if path.rsplit(".", 1)[-1].endswith(OBJECT_TYPE):
            return True
    return False


def is_strawberry_field(function, context):
    paths = (decorator_path(item, context) for item in function.decorator_list)
    return any(is_strawberry(path, {FIELD_DECORATOR}) for path in paths)


def imports_package(context, package):
    return any(
        value.split(".")[0].startswith(package)
        for table in context.aliases[:2]
        for value in table.values()
    )


def strawberry_resolvers(cls, context):
    for item in cls.body:
        if isinstance(item, FUNCTIONS) and is_strawberry_field(item, context):
            yield Resolver(cls.name, item.name, item, STRAWBERRY)


def graphene_resolvers(cls):
    for item in cls.body:
        if isinstance(item, FUNCTIONS) and item.name.startswith(RESOLVER_PREFIX):
            yield Resolver(cls.name, item.name[len(RESOLVER_PREFIX) :], item, GRAPHENE)


def resolvers_in(context):
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.ClassDef):
            continue
        if is_strawberry_type(node, context):
            yield from strawberry_resolvers(node, context)
        elif is_graphene_type(node, context):
            yield from graphene_resolvers(node)
