import ast

from checks.common import finding
from django_declarations.classes import (
    admin_model,
    assignment,
    derives_from,
    meta_assignment,
    meta_model,
    view_model,
)
from django_declarations.entries import cleaned, entries
from django_declarations.known import annotated_names
from django_models.graph import project_graph
from django_models.lookups import resolver
from orm.models import class_assignments, constant, keyword
from query_fields.paths import path_problem

RULE = "unresolved-query-field"
VIEW_ATTRIBUTES = (
    "search_fields",
    "ordering_fields",
    "ordering",
    "filterset_fields",
    "filter_fields",
)
ADMIN_ATTRIBUTES = ("search_fields", "ordering", "list_filter")


def filter_names(cls):
    found = []
    for _, call in class_assignments(cls):
        if not isinstance(call, ast.Call) or keyword(call, "method") is not None:
            continue
        node = keyword(call, "field_name")
        text = (
            cleaned(constant(node), "field_name")
            if isinstance(constant(node), str)
            else None
        )
        if text is not None:
            found.append(("field_name", text, node))
    return found


def listed(cls, attributes, read):
    return [(a, *item) for a in attributes for item in entries(read(cls, a), a)]


def declared_entries(cls, context):
    if derives_from(cls, context, "django.contrib.admin", "ModelAdmin"):
        return admin_model(cls, context), listed(cls, ADMIN_ATTRIBUTES, assignment)
    if derives_from(cls, context, "rest_framework"):
        return view_model(cls, context), listed(cls, VIEW_ATTRIBUTES, assignment)
    if derives_from(cls, context, "django_filters", "FilterSet"):
        items = listed(cls, ("fields",), meta_assignment) + filter_names(cls)
        return meta_model(cls, context), items
    return None, []


def class_findings(cls, context, tools):
    model, items = declared_entries(cls, context)
    if model is None:
        return []
    declared = {name for name, _ in class_assignments(cls)}
    found = []
    for attribute, text, node in items:
        kind = path_problem(model, text, attribute, tools)
        if kind is not None and text.split("__")[0] not in declared:
            subject = f"{attribute}|{text}|{model.name}|{kind}"
            found.append(finding(context.path, RULE, subject, node))
    return found


def check(context):
    if context.tests:
        return []
    project = context.project
    tools = (project_graph(project), resolver(project), annotated_names(project))
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.ClassDef):
            found.extend(class_findings(node, context, tools))
    return found
