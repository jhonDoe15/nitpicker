import ast
import re

from checks.common import finding
from contracts.web import imports_web, is_injected, parameters_with_defaults, route_decorators
from request_text.lookups import is_identifier_name, reaches_lookup
from request_text.models import class_index, model_of, strips_every_string, text_fields
from signatures.annotations import FUNCTION_TYPES, members_of, qualified_name

RULE = "untrimmed-request-text"
GUARDED = True
SOURCES = {"args", "form", "values", "json", "GET", "POST"}
PASS_THROUGH = {"lower", "upper", "casefold", "title"}
OTHER_SOURCES = {"Path", "Header", "Cookie", "Depends", "Security", "File", "Body"}
NONE_MEMBER = "None"
PATH_FIELD = re.compile(r"\{(\w+)(?::[^}]*)?\}")


def peel_once(node):
    if isinstance(node, ast.BoolOp):
        return node.values[0]
    if isinstance(node, ast.Subscript):
        return node.value
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "str" and node.args:
        return node.args[0]
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        return node.func.value if node.func.attr in {"get", *PASS_THROUGH} else None
    return None


def peeled(node):
    current = node
    while peel_once(current) is not None:
        current = peel_once(current)
    return current


def is_request_text(node):
    source = peeled(node)
    return (
        isinstance(source, ast.Attribute)
        and source.attr in SOURCES
        and isinstance(source.value, ast.Name)
        and source.value.id == "request"
    )


def is_text_annotation(annotation):
    members = [name for name in members_of(annotation) if name != NONE_MEMBER]
    return members == ["str"]


def metadata_names(annotation):
    names = []
    for node in ast.walk(annotation) if annotation is not None else []:
        if isinstance(node, ast.Call):
            names.append(node.func.attr if isinstance(node.func, ast.Attribute) else getattr(node.func, "id", ""))
    return names


def route_paths(decorators):
    return {
        name
        for decorator in decorators
        if isinstance(decorator, ast.Call) and decorator.args
        and isinstance(decorator.args[0], ast.Constant)
        and isinstance(decorator.args[0].value, str)
        for name in PATH_FIELD.findall(decorator.args[0].value)
    }


def is_query_text(argument, default, context, path_names):
    names = metadata_names(argument.annotation) + metadata_names(default)
    return (
        is_text_annotation(argument.annotation)
        and argument.arg not in path_names
        and not any(name in OTHER_SOURCES or name == "StringConstraints" for name in names)
        and not is_injected(argument, default, context)
    )


def rebound(function):
    counts = {}
    for node in ast.walk(function):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            counts[node.id] = counts.get(node.id, 0) + 1
    return counts


def source_nodes(function):
    return [
        node
        for node in ast.walk(function)
        if isinstance(node, (ast.Call, ast.Subscript)) and is_request_text(node)
    ]


def model_uses(function, argument, fields):
    return [
        node
        for node in ast.walk(function)
        if isinstance(node, ast.Attribute)
        and node.attr in fields
        and not is_identifier_name(node.attr)
        and isinstance(node.value, ast.Name)
        and node.value.id == argument
    ]


def name_uses(function, name):
    return [
        node
        for node in ast.walk(function)
        if isinstance(node, ast.Name) and node.id == name and isinstance(node.ctx, ast.Load)
    ]


def parameter_findings(function, context, decorators):
    stores = rebound(function)
    path_names = route_paths(decorators)
    found = []
    for argument, default in parameters_with_defaults(function):
        name = argument.arg
        if is_query_text(argument, default, context, path_names):
            uses = [] if is_identifier_name(name) or stores.get(name) else name_uses(function, name)
            label = name
        else:
            model = model_of(argument.annotation, context.project) if argument.annotation else None
            index = class_index(context.project)
            fields = set() if model is None or strips_every_string(model, index) else text_fields(model, index)
            uses = model_uses(function, name, fields)
            label = f"{name}.{uses[0].attr}" if uses else name
        if any(reaches_lookup(node, context) for node in uses):
            found.append(finding(context.path, RULE, f"{qualified_name(function, context)}({label})", argument))
    return found


def assignment_findings(function, context):
    stores = rebound(function)
    found = []
    for node in ast.walk(function):
        single = isinstance(node, ast.Assign) and len(node.targets) == 1
        target = node.targets[0] if single else None
        if isinstance(target, ast.Name) and is_request_text(node.value):
            reached = not is_identifier_name(target.id) and stores[target.id] == 1
            if reached and any(reaches_lookup(use, context) for use in name_uses(function, target.id)):
                found.append(finding(context.path, RULE, f"{qualified_name(function, context)}({target.id})", node))
    return found


def direct_findings(function, context):
    found = {}
    for node in source_nodes(function):
        if reaches_lookup(node, context):
            label = f"{qualified_name(function, context)}({ast.unparse(node)})"
            found.setdefault(node.lineno, finding(context.path, RULE, label, node))
    return list(found.values())


def has_request_parameter(function):
    return any(argument.arg == "request" for argument in function.args.args)


def function_findings(function, context):
    decorators = route_decorators(function, context, True)
    if not decorators and not has_request_parameter(function):
        return []
    found = assignment_findings(function, context) + direct_findings(function, context)
    return found + (parameter_findings(function, context, decorators) if decorators else [])


def check(context):
    if not imports_web(context):
        return []
    return [
        item
        for node in ast.walk(context.tree)
        if isinstance(node, FUNCTION_TYPES)
        for item in function_findings(node, context)
    ]
