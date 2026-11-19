import ast

from checks.common import dotted_name, finding
from django_declarations.classes import derives_from, meta_model
from django_declarations.known import is_closed, opaque_names, parent_models
from django_models.graph import project_graph
from django_models.lookups import forward_target, resolver
from django_models.origin import queryset_model
from orm.models import class_assignments, constant, keyword

RULE = "filter-model-mismatch"
MODEL_FILTERS = {"ModelChoiceFilter", "ModelMultipleChoiceFilter"}
ID_SUFFIX = "_id"


def filter_calls(cls, context):
    for name, call in class_assignments(cls):
        if not isinstance(call, ast.Call):
            continue
        dotted = dotted_name(call.func, context.aliases) or ""
        if dotted.rsplit(".", 1)[-1] in MODEL_FILTERS:
            yield name, call


def related_model(model, text, tools):
    graph, resolve = tools
    found = resolve(model, text)
    if found.rest:
        return None
    if found.reverse is not None:
        return found.reverse.owner
    if found.field is not None and found.field.relation is not None:
        return forward_target(found.model, found.field.relation, graph)
    return None


def relation_paths(name, call):
    given = constant(keyword(call, "field_name"))
    if isinstance(given, str):
        return [given]
    return [name, name.removesuffix(ID_SUFFIX)]


def is_related(first, second, graph):
    return first.key in {m.key for m in parent_models(second, graph)} or (
        second.key in {m.key for m in parent_models(first, graph)}
    )


def mismatch(model, name, call, target, tools):
    for path in relation_paths(name, call):
        related = related_model(model, path, tools)
        if related is not None:
            if is_related(related, target, tools[0]):
                return None
            return f"{name}|{target.name}|{related.name}"
    return None


def missing_key(name, call, target, graph):
    key = constant(keyword(call, "to_field_name"))
    if not isinstance(key, str) or key == "pk" or not is_closed(target, graph):
        return None
    if key in target.fields or key in opaque_names(target, graph):
        return None
    return f"{name}|{target.name}|{key}|to_field_name"


def filter_findings(name, call, model, context, tools):
    queryset = keyword(call, "queryset")
    target = queryset_model(queryset, context) if queryset is not None else None
    if target is None:
        return []
    subjects = [
        mismatch(model, name, call, target, tools),
        missing_key(name, call, target, tools[0]),
    ]
    return [finding(context.path, RULE, text, call) for text in subjects if text]


def check(context):
    if context.tests:
        return []
    graph = project_graph(context.project)
    tools = (graph, resolver(context.project))
    found = []
    for cls in ast.walk(context.tree):
        if not isinstance(cls, ast.ClassDef):
            continue
        if not derives_from(cls, context, "django_filters", "FilterSet"):
            continue
        model = meta_model(cls, context)
        if model is not None:
            for name, call in filter_calls(cls, context):
                found.extend(filter_findings(name, call, model, context, tools))
    return found
