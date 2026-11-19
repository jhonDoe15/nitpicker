import ast

from django_models.graph import project_graph
from orm.origins import DJANGO_MANAGERS
from security.resolve.scopes import definition, where_of

TERMINALS = {
    "get",
    "first",
    "last",
    "count",
    "exists",
    "create",
    "update",
    "delete",
    "get_or_create",
    "update_or_create",
    "in_bulk",
    "aggregate",
    "earliest",
    "latest",
}
ITERATING_CALLS = {"list", "tuple", "set", "len", "sorted", "sum", "any", "all"}


def is_terminal(name):
    return name in TERMINALS or name.startswith("bulk_")


def manager_owner(node):
    while True:
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute) and is_terminal(node.func.attr):
                return None
            node = node.func
        elif isinstance(node, ast.Attribute):
            if node.attr in DJANGO_MANAGERS:
                return node.value
            node = node.value
        else:
            return None


def is_model(owner, node, context):
    found = definition(owner, where_of(node, context), kinds=(ast.ClassDef,))
    if found is None:
        return False
    key = (found[1].context.path, found[0].name)
    return key in project_graph(context.project).by_key


def terminal_label(call, context):
    func = call.func
    if not (isinstance(func, ast.Attribute) and is_terminal(func.attr)):
        return None
    owner = manager_owner(func.value)
    if owner is None or not is_model(owner, call, context):
        return None
    return f"{ast.unparse(owner)}.objects.{func.attr}"


def iterated_chain(node, context):
    owner = manager_owner(node) if isinstance(node, ast.Call) else None
    if owner is None or not is_model(owner, node, context):
        return None
    return f"{ast.unparse(owner)}.objects.iterate"


def iteration_label(node, context):
    if isinstance(node, ast.comprehension) and node.is_async:
        return None
    if isinstance(node, (ast.For, ast.comprehension)):
        return iterated_chain(node.iter, context)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        if node.func.id in ITERATING_CALLS and len(node.args) == 1:
            return iterated_chain(node.args[0], context)
    return None
