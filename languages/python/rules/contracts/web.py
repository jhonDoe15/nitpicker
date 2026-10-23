import ast

from boundary.type_aliases import alias_statements
from checks.common import dotted_name
from contracts.infrastructure import TRANSPORT, kind_of, located_key

WEB_ROOTS = frozenset(TRANSPORT) | {"ninja"}
WEB_PARTS = {
    "django": (
        "django.views.",
        "django.http.",
        "django.shortcuts.",
        "django.contrib.admin.",
        "django.contrib.auth.decorators.",
        "django.contrib.auth.mixins.",
    ),
}
ROUTE_METHODS = {
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options",
    "route",
    "api_route",
    "websocket",
    "websocket_route",
}
INJECTOR_ROOTS = {"fastapi", "fast_depends", "faststream"}
INJECTORS = {"Depends", "Security"}
ANNOTATED = "Annotated"
REQUEST_NAME = "request"


def is_web_name(dotted):
    root = dotted.split(".")[0]
    if root not in WEB_ROOTS:
        return False
    parts = WEB_PARTS.get(root)
    return parts is None or dotted.startswith(parts)


def is_web_node(node, context):
    return is_web_name(dotted_name(node, context.aliases) or "")


def imported_web(context):
    names, modules = context.aliases[:2]
    return [
        value for value in [*names.values(), *modules.values()] if is_web_name(value)
    ]


def imports_web(context, root=None):
    return any(root in (None, value.split(".")[0]) for value in imported_web(context))


def is_route_decorator(decorator, context, web):
    target = decorator.func if isinstance(decorator, ast.Call) else decorator
    if is_web_node(target, context):
        return True
    return web and isinstance(target, ast.Attribute) and target.attr in ROUTE_METHODS


def route_decorators(function, context, web):
    return [d for d in function.decorator_list if is_route_decorator(d, context, web)]


def is_web_class(node, context):
    return any(is_web_node(base, context) for base in node.bases)


def first_parameter(function, method):
    arguments = function.args.posonlyargs + function.args.args
    return arguments[1 if method else 0] if len(arguments) > int(method) else None


def takes_request_first(function, context, method):
    first = first_parameter(function, method)
    if first is None:
        return False
    if first.annotation is None:
        return first.arg == REQUEST_NAME
    return kind_of(dotted_name(first.annotation, context.aliases)) == "transport"


def is_injector(node, context):
    if not isinstance(node, ast.Call):
        return False
    name = dotted_name(node.func, context.aliases) or ""
    return name.split(".")[0] in INJECTOR_ROOTS and name.rsplit(".", 1)[-1] in INJECTORS


def annotated_injection(annotation, context):
    if not isinstance(annotation, ast.Subscript):
        return False
    if not (dotted_name(annotation.value, context.aliases) or "").endswith(ANNOTATED):
        return False
    elements = annotation.slice.elts if isinstance(annotation.slice, ast.Tuple) else []
    return any(is_injector(element, context) for element in elements[1:])


def injected_aliases(project):
    def build(_):
        found = set()
        for path, context in project.contexts.items():
            for name, value in alias_statements(context.tree):
                if annotated_injection(value, context):
                    found.add((path, name))
        return found

    return project.memo("injected-aliases", build)


def is_injected_annotation(annotation, context):
    if annotated_injection(annotation, context):
        return True
    name = dotted_name(annotation, context.aliases)
    return bool(name) and located_key(name, context) in injected_aliases(
        context.project
    )


def parameters_with_defaults(function):
    arguments = function.args
    positional = arguments.posonlyargs + arguments.args
    missing = len(positional) - len(arguments.defaults)
    yield from zip(positional, [None] * missing + list(arguments.defaults))
    yield from zip(arguments.kwonlyargs, arguments.kw_defaults)


def is_injected(argument, default, context):
    if is_injector(default, context):
        return True
    annotation = argument.annotation
    return annotation is not None and is_injected_annotation(annotation, context)


def injected_names(function, context):
    return {
        argument.arg
        for argument, default in parameters_with_defaults(function)
        if is_injected(argument, default, context)
    }


def signature_sites(function, context):
    injected = injected_names(function, context)
    arguments = function.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    every += [argument for argument in (arguments.vararg, arguments.kwarg) if argument]
    for argument in every:
        if argument.annotation is not None and argument.arg not in injected:
            yield f"parameter {argument.arg}", argument.annotation
    if function.returns is not None:
        yield "return type", function.returns
