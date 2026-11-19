import ast

from checks.common import dotted_name, last_name, walk_statements
from database_aliases.calls import model_names, runs_query
from database_aliases.passing import guards_alias
from database_aliases.scopes import MIGRATION_ALIAS, alias_in_scope
from kinds.index import functions_of
from orm.origins import DJANGO_MANAGERS
from signal_receivers.invalidation import project_functions
from soft_delete.reads import outer_chain

RUN_PYTHON = "RunPython"


def migration_functions(context):
    def build(_):
        names = set()
        for node in ast.walk(context.tree):
            if isinstance(node, ast.Call) and last_name(node.func) == RUN_PYTHON:
                values = node.args[:2] + [k.value for k in node.keywords]
                names.update(v.id for v in values if isinstance(v, ast.Name))
        return [
            (qualified, function)
            for qualified, function in functions_of(context)
            if function.name in names
        ]

    return context.project.memo(("migration-functions", context.path), build)


def is_imported_model(node, context):
    dotted = dotted_name(node, context.aliases) or ""
    parts = dotted.split(".")
    models = model_names(context.project)
    return "models" in parts[:-1] and parts[-1] in models


def queries_default_manager(function, context):
    return any(
        isinstance(node, ast.Attribute)
        and node.attr in DJANGO_MANAGERS
        and isinstance(node.value, ast.Name)
        and node.value.id in model_names(context.project)
        for node in walk_statements(function.body)
    )


def helper_calls(function, context):
    helpers = project_functions(context.project)
    for node in walk_statements(function.body):
        if not isinstance(node, ast.Call):
            continue
        defined = helpers.get(last_name(node.func), [])
        if len(defined) == 1 and defined[0][0] is not function:
            if queries_default_manager(*defined[0]):
                yield node, f"{ast.unparse(node.func)}()"


def historical_models(function, context):
    for node in walk_statements(function.body):
        if isinstance(node, ast.Attribute) and node.attr in DJANGO_MANAGERS:
            if is_imported_model(node.value, context):
                chain = outer_chain(node, context.parents)
                if runs_query(chain, context):
                    yield chain, ast.unparse(node)


def historical_findings(context):
    found = []
    for qualified, function in migration_functions(context):
        alias = alias_in_scope(function) or MIGRATION_ALIAS
        sites = [*historical_models(function, context)]
        if not guards_alias(function, alias):
            sites += [*helper_calls(function, context)]
        found.extend(
            (node, f"{qualified}|{op}|{alias}|historical") for node, op in sites
        )
    return found
