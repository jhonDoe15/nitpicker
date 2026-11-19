import ast
import re

from checks.common import dotted_name, own_nodes
from http_values.request_names import is_request

JSON_LOADERS = {"json.loads", "json.load", "orjson.loads", "ujson.loads", "simplejson.loads"}
JSON_METHODS = {"json", "get_json"}
REQUEST_ATTRIBUTES = {"data", "json"}
MUTATION_METHODS = re.compile(
    r"^(?:clean_input|perform_mutation|mutate|mutate_and_get_payload|resolve_\w+|clean_\w+)$"
)
ALWAYS_INPUT = {"cleaned_input"}
MUTATION_INPUT = {"input", "data"}
ANNOTATED_INPUT = {"input", "data", "payload", "body", "cleaned_input"}
LOOSE_MAPPING = re.compile(r"\b(?:dict|Dict|Mapping|MutableMapping)\[str, (?:typing\.)?(?:Any|object)\]")


def keeps_nulls(call):
    for keyword in call.keywords:
        if keyword.arg == "exclude_none":
            return not (isinstance(keyword.value, ast.Constant) and keyword.value.value is True)
    return True


def is_call_source(call, context):
    if dotted_name(call.func, context.aliases) in JSON_LOADERS:
        return True
    if not isinstance(call.func, ast.Attribute):
        return False
    if call.func.attr in JSON_METHODS:
        return not call.args and not call.keywords
    return call.func.attr == "model_dump" and keeps_nulls(call)


def is_source(node, names, context):
    if isinstance(node, ast.Await):
        node = node.value
    if isinstance(node, ast.Name):
        return node.id in names
    if isinstance(node, ast.Call):
        return is_call_source(node, context)
    if isinstance(node, ast.Attribute):
        return node.attr in REQUEST_ATTRIBUTES and is_request(node.value)
    if isinstance(node, ast.Subscript):
        key = node.slice
        return (
            isinstance(key, ast.Constant)
            and isinstance(key.value, str)
            and is_source(node.value, names, context)
        )
    return False


def loose_annotation(annotation):
    return annotation is not None and LOOSE_MAPPING.search(ast.unparse(annotation)) is not None


def parameter_inputs(function):
    arguments = function.args
    mutation = MUTATION_METHODS.match(function.name) is not None
    names = set()
    for argument in arguments.posonlyargs + arguments.args + arguments.kwonlyargs:
        if argument.annotation is not None:
            if argument.arg in ANNOTATED_INPUT and loose_annotation(argument.annotation):
                names.add(argument.arg)
        elif argument.arg in ALWAYS_INPUT or (mutation and argument.arg in MUTATION_INPUT):
            names.add(argument.arg)
    if mutation and arguments.kwarg is not None:
        names.add(arguments.kwarg.arg)
    return names


def assignments_of(function):
    assigned, others, recognized = {}, set(), set()
    for node in own_nodes(function):
        target = None
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target, annotation = node.targets[0], None
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            target, annotation = node.target, node.annotation
        if isinstance(target, ast.Name):
            recognized.add(id(target))
            assigned.setdefault(target.id, []).append((node.value, annotation))
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store) and id(node) not in recognized:
            others.add(node.id)
    return assigned, others


def input_names(function, context):
    names = parameter_inputs(function)
    assigned, others = assignments_of(function)
    for name, entries in assigned.items():
        typed = [annotation for _, annotation in entries if annotation is not None]
        if name in others or (typed and not all(loose_annotation(item) for item in typed)):
            continue
        if all(is_source(value, names, context) for value, _ in entries):
            names.add(name)
    return names
