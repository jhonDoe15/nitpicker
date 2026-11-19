import ast

from checks.common import finding
from django_declarations.classes import ancestors, meta_model
from django_declarations.known import annotated_names
from django_models.graph import project_graph
from table_columns.accessors import accessor_problem
from table_columns.columns import (
    accessor_text,
    declared_columns,
    is_table,
    meta_unsortable,
    sort_declared,
    table_methods,
)

RULE = "unsortable-table-column"


def inherited_model(cls, context):
    for owner, owner_context in ancestors(cls, context):
        model = meta_model(owner, owner_context)
        if model is not None:
            return model
    return None


def table_findings(cls, context, graph):
    model = inherited_model(cls, context)
    family = ancestors(cls, context)
    if model is None or any(meta_unsortable(owner) for owner, _ in family):
        return []
    methods = set().union(*(table_methods(owner) for owner, _ in family))
    annotated = annotated_names(context.project)
    found = []
    for name, call in declared_columns(cls, context):
        text = accessor_text(name, call)
        if text is None or text.split("__")[0] in annotated:
            continue
        if sort_declared(name, call, methods):
            continue
        kind = accessor_problem(model, text, graph, context.project)
        if kind is not None:
            subject = f"{name}|{model.name}|{kind}"
            found.append(finding(context.path, RULE, subject, call))
    return found


def check(context):
    if context.tests:
        return []
    graph = project_graph(context.project)
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.ClassDef) and is_table(node, context):
            found.extend(table_findings(node, context, graph))
    return found
