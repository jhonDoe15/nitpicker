import ast

from checks.common import dotted_name, finding, functions_of, own_nodes
from contracts.entities import entities_in, entity_named
from contracts.infrastructure import kind_of
from contracts.web import (
    imports_web,
    is_web_class,
    route_decorators,
    signature_sites,
    takes_request_first,
)

RULE = "handler-entity-type"
RESPONSE_KEYWORDS = {"response_model", "response"}
RETURN_SITE = "return type"
RETURNED = "returned value"
RESPONSE_BODY = "response body"
DJANGO = "django"
VIEW_METHODS = {
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options",
    "list",
    "retrieve",
    "create",
    "update",
    "partial_update",
    "destroy",
}
SCALAR_CALLS = {"values", "values_list", "count", "exists", "aggregate"}
RESPONSE_FUNCTIONS = {"flask.jsonify", "quart.jsonify"}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
CHAINS = (ast.Call, ast.Attribute, ast.Subscript)


def web_classes(context):
    for node in ast.walk(context.tree):
        if isinstance(node, ast.ClassDef) and is_web_class(node, context):
            yield node


def view_methods(context):
    for node in web_classes(context):
        for statement in node.body:
            if isinstance(statement, FUNCTIONS) and statement.name in VIEW_METHODS:
                yield statement


def function_views(context):
    if not imports_web(context, DJANGO):
        return
    for node in context.tree.body:
        if isinstance(node, FUNCTIONS) and takes_request_first(node, context, False):
            yield node


def handlers_of(context):
    web = imports_web(context)
    found = {}
    for function in functions_of(context.tree):
        decorators = route_decorators(function, context, web)
        if decorators:
            found[function] = decorators
    for function in [*view_methods(context), *function_views(context)]:
        found.setdefault(function, [])
    return found


def labels_of(context):
    labels = {}
    for node in ast.walk(context.tree):
        if isinstance(node, ast.ClassDef):
            labels.update(
                (s, f"{node.name}.{s.name}")
                for s in node.body
                if isinstance(s, FUNCTIONS)
            )
    return labels


def response_keywords(decorators):
    for decorator in decorators:
        for keyword in getattr(decorator, "keywords", []):
            value = keyword.value
            if keyword.arg in RESPONSE_KEYWORDS and not is_none(value):
                yield keyword


def is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


def chain_nodes(node):
    while isinstance(node, CHAINS):
        if isinstance(node, ast.Attribute):
            yield node
        node = node.func if isinstance(node, ast.Call) else node.value
    yield node


def is_scalar_call(node):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in SCALAR_CALLS
    )


def parameter_types(function):
    arguments = function.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    return {a.arg: a.annotation for a in every if a.annotation is not None}


def assigned_values(function):
    assignments = [
        node
        for node in own_nodes(function)
        if isinstance(node, ast.Assign) and len(node.targets) == 1
    ]
    assignments.sort(key=lambda node: node.lineno)
    values = parameter_types(function)
    values.update(
        (node.targets[0].id, node.value)
        for node in assignments
        if isinstance(node.targets[0], ast.Name)
    )
    return values


def value_entity(node, context, assigned):
    if is_scalar_call(node):
        return None
    for part in chain_nodes(node):
        if isinstance(part, ast.Name) and part.id in assigned:
            return value_entity(assigned[part.id], context, {})
        found = (
            entity_named(part, context) if dotted_name(part, context.aliases) else None
        )
        if found is not None:
            return found
    return None


def is_response_call(node, context):
    name = dotted_name(node.func, context.aliases) or ""
    return kind_of(name) == "transport" or name in RESPONSE_FUNCTIONS


def body_values(function, context, typed):
    for node in own_nodes(function):
        if isinstance(node, ast.Return) and node.value is not None and not typed:
            yield RETURNED, node.value
        elif (
            isinstance(node, ast.Call) and node.args and is_response_call(node, context)
        ):
            yield RESPONSE_BODY, node.args[0]


def body_entities(function, context, typed):
    assigned = assigned_values(function)
    for site, value in body_values(function, context, typed):
        found = value_entity(value, context, assigned)
        if found is not None:
            yield site, found


def declared_entities(function, context, keywords):
    for site, expression in signature_sites(function, context):
        if not (keywords and site == RETURN_SITE):
            yield from ((site, found) for found in entities_in(expression, context))
    for keyword in keywords:
        site = f"{keyword.arg}="
        yield from ((site, found) for found in entities_in(keyword.value, context))


def handler_findings(context, handler):
    function, decorators, label = handler
    keywords = list(response_keywords(decorators))
    typed = bool(keywords) or function.returns is not None
    sites = {}
    for site, (entity, orm) in [
        *declared_entities(function, context, keywords),
        *body_entities(function, context, typed),
    ]:
        sites.setdefault((entity.rsplit(".", 1)[-1], orm), site)
    return [
        finding(context.path, RULE, f"{label}|{site}|{entity}|{orm}", function)
        for (entity, orm), site in sites.items()
    ]


def check(context):
    if context.tests:
        return []
    labels = labels_of(context)
    found = []
    for function, decorators in handlers_of(context).items():
        label = labels.get(function, function.name)
        found.extend(handler_findings(context, (function, decorators, label)))
    return found
