import ast

from checks.common import dotted_name, finding, functions_of
from contracts.entities import entities_in
from contracts.members import ROUTE_METHODS

RULE = "handler-entity-type"
WEB_ROOTS = {"fastapi", "starlette", "flask", "quart", "litestar", "ninja", "sanic"}
RESPONSE_KEYWORDS = {"response_model", "response"}


def imports_web(context):
    names, modules = context.aliases[:2]
    imported = list(names.values()) + list(modules.values())
    return any(value.split(".")[0] in WEB_ROOTS for value in imported)


def is_route(decorator, context, web):
    if not isinstance(decorator, ast.Call):
        return False
    target = decorator.func
    root = (dotted_name(target, context.aliases) or "").split(".")[0]
    if root in WEB_ROOTS:
        return True
    return web and isinstance(target, ast.Attribute) and target.attr in ROUTE_METHODS


def route_decorators(function, context, web):
    return [d for d in function.decorator_list if is_route(d, context, web)]


def parameter_sites(function):
    arguments = function.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    for argument in every:
        if argument.annotation is not None:
            yield f"parameter {argument.arg}", argument.annotation


def sites_of(function, decorators):
    yield from parameter_sites(function)
    if function.returns is not None:
        yield "return type", function.returns
    for decorator in decorators:
        for keyword in decorator.keywords:
            if keyword.arg in RESPONSE_KEYWORDS:
                yield f"{keyword.arg}=", keyword.value


def handler_findings(function, context, decorators):
    sites = {}
    for site, expression in sites_of(function, decorators):
        for entity, orm in entities_in(expression, context):
            sites.setdefault((entity.rsplit(".", 1)[-1], orm), site)
    return [
        finding(context.path, RULE, f"{function.name}|{site}|{entity}|{orm}", function)
        for (entity, orm), site in sites.items()
    ]


def check(context):
    if context.tests:
        return []
    web = imports_web(context)
    found = []
    for function in functions_of(context.tree):
        decorators = route_decorators(function, context, web)
        if decorators:
            found.extend(handler_findings(function, context, decorators))
    return found
