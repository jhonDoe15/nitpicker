import ast

from django_models.graph import project_graph
from orm.origins import DJANGO_MANAGERS, DJANGO_QUERYSET, resolve_name
from security.resolve.scopes import MAX_HOPS, definition, enclosing_class, where_of

CHAIN = DJANGO_QUERYSET | {"none"}


def is_class_alias(node):
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        return node.func.id == "type" and len(node.args) == 1
    return isinstance(node, ast.Attribute) and node.attr == "__class__"


def model_of_class(node, context):
    graph = project_graph(context.project)
    if isinstance(node, ast.Name) and node.id == "cls" or is_class_alias(node):
        node = enclosing_class(node, context)
        found = (node, where_of(node, context)) if node is not None else None
    else:
        found = definition(node, where_of(node, context))
    if found is None:
        return None
    return graph.by_key.get((found[1].context.path, found[0].name))


def manager_names(model):
    return DJANGO_MANAGERS | set(model.managers)


def queryset_model(node, context, depth=0):
    if depth > MAX_HOPS:
        return None
    if isinstance(node, ast.Await):
        return queryset_model(node.value, context, depth)
    if isinstance(node, ast.Name):
        value, place = resolve_name(node, where_of(node, context))
        if value is None or value is node:
            return None
        return queryset_model(value, place.context, depth + 1)
    if isinstance(node, ast.Call):
        function = node.func
        if isinstance(function, ast.Attribute) and function.attr in CHAIN:
            return queryset_model(function.value, context, depth + 1)
        return None
    if isinstance(node, ast.Attribute):
        model = model_of_class(node.value, context)
        if model is not None and node.attr in manager_names(model):
            return model
    return None


def terminal_call(node, context):
    function = node.func if isinstance(node, ast.Call) else None
    if not isinstance(function, ast.Attribute):
        return None
    model = queryset_model(function.value, context)
    return (model, function.attr) if model is not None else None
