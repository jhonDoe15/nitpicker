import ast

from django_models.graph import project_graph
from django_models.origin import CHAIN
from nullable_access.sources import instance_of, is_method_of_model
from security.resolve.scopes import FUNCTIONS, scope_of


def owner_model(name, function, context):
    if name == "self":
        return is_method_of_model(function, context)
    return instance_of(name, function, context)[0]


def accessor_target(model, accessor, graph):
    for item in graph.reverse.get(model.key, []):
        if item.name == accessor:
            implicit = () if item.relation.many else (item.relation.name,)
            return item.owner, implicit
    field = model.fields.get(accessor)
    relation = field.relation if field else None
    if relation is not None and relation.many:
        keys = graph.by_name.get(relation.target, [])
        return (keys[0], ()) if len(keys) == 1 else None
    return None


def related_queryset(node, context, depth=0):
    if depth > 4:
        return None
    if isinstance(node, ast.Call):
        function = node.func
        if isinstance(function, ast.Attribute) and function.attr in CHAIN:
            return related_queryset(function.value, context, depth + 1)
        return None
    if not isinstance(node, ast.Attribute) or not isinstance(node.value, ast.Name):
        return None
    function = scope_of(node, context)
    if not isinstance(function, FUNCTIONS):
        return None
    owner = owner_model(node.value.id, function, context)
    if owner is None:
        return None
    return accessor_target(owner, node.attr, project_graph(context.project))


def related_call(call, context):
    if not isinstance(call.func, ast.Attribute):
        return None
    found = related_queryset(call.func.value, context)
    return (found[0], call.func.attr, found[1]) if found is not None else None
