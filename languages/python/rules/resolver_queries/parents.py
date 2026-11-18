import ast
import re

from resolver_queries.resolvers import (
    GRAPHENE,
    STRAWBERRY,
    imports_package,
    is_strawberry_field,
    is_strawberry_type,
)

LIST_HEADS = {
    "list",
    "List",
    "Sequence",
    "Iterable",
    "Collection",
    "Connection",
    "ListConnection",
}
LIST_FIELDS = {
    "List",
    "DjangoListField",
    "DjangoFilterConnectionField",
    "SQLAlchemyConnectionField",
    "ConnectionField",
}
CONNECTION_NODE = "node"
STRING_LIST = re.compile(r"\b(?:" + "|".join(sorted(LIST_HEADS)) + r")\[\s*['\"]?(\w+)")


def head_name(node):
    if isinstance(node, ast.Attribute):
        return node.attr
    return node.id if isinstance(node, ast.Name) else None


def names_inside(node):
    found = set()
    for inner in ast.walk(node):
        if isinstance(inner, ast.Name):
            found.add(inner.id)
        elif isinstance(inner, ast.Constant) and isinstance(inner.value, str):
            found.add(inner.value.strip("!"))
    return found


def annotation_names(node):
    found = set()
    for inner in ast.walk(node):
        if isinstance(inner, ast.Subscript) and head_name(inner.value) in LIST_HEADS:
            found |= names_inside(inner.slice)
        elif isinstance(inner, ast.Constant) and isinstance(inner.value, str):
            found |= set(STRING_LIST.findall(inner.value))
    return found


def connection_nodes(node):
    found = set()
    if isinstance(node, ast.ClassDef):
        for item in node.body:
            if isinstance(item, ast.ClassDef):
                for entry in item.body:
                    is_node = isinstance(entry, ast.Assign) and any(
                        isinstance(target, ast.Name) and target.id == CONNECTION_NODE
                        for target in entry.targets
                    )
                    if is_node:
                        found |= names_inside(entry.value)
    return found


def field_names(node):
    if isinstance(node, ast.Call) and head_name(node.func) in LIST_FIELDS:
        return set().union(*(names_inside(argument) for argument in node.args), set())
    return set()


def strawberry_names(context):
    found = set()
    for node in ast.walk(context.tree):
        if isinstance(node, ast.ClassDef) and is_strawberry_type(node, context):
            for item in node.body:
                if isinstance(item, ast.AnnAssign):
                    found |= annotation_names(item.annotation)
        is_function = isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        if (
            is_function
            and node.returns is not None
            and is_strawberry_field(node, context)
        ):
            found |= annotation_names(node.returns)
    return found


def graphene_names(context):
    found = set()
    for node in ast.walk(context.tree):
        found |= field_names(node) | connection_nodes(node)
    return found


def names_in(context):
    found = set()
    if imports_package(context, STRAWBERRY):
        found |= strawberry_names(context)
    if imports_package(context, GRAPHENE):
        found |= graphene_names(context)
    return found


def list_parents(project):
    def build(_):
        found = set()
        for context in project.contexts.values():
            if not context.tests:
                found |= names_in(context)
        return found

    return project.memo("graphql-list-parents", build)
