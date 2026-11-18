import ast
import re

from checks.common import finding, shown, string_value
from text_splits.pairs import last_name, scope_of

RULE = "delimited-lookup-key"
DELIMITER = re.compile(r"^[^\w\s%{}]{1,2}$")
ID_NAME = re.compile(r"(?:id|uuid|hash|index|idx|count|len|size)$", re.I)
CONTAINERS = {
    "dict", "Dict", "defaultdict", "DefaultDict", "OrderedDict", "set", "Set",
    "MutableMapping", "Mapping", "MutableSet", "AbstractSet", "Counter",
}  # fmt: skip
LOOKUPS = {"get", "setdefault", "pop", "add", "discard", "remove"}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def base_name(annotation):
    if isinstance(annotation, ast.Subscript):
        return base_name(annotation.value)
    return last_name(annotation)


def is_string_annotation(annotation):
    return isinstance(annotation, ast.Name) and annotation.id == "str"


def container_value(node):
    if isinstance(node, (ast.Dict, ast.DictComp, ast.Set, ast.SetComp)):
        return True
    return isinstance(node, ast.Call) and last_name(node.func) in CONTAINERS


def declared(tree):
    containers = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.AnnAssign):
            target = ast.unparse(node.target)
            if base_name(node.annotation) in CONTAINERS:
                containers.add(target)
        elif isinstance(node, ast.Assign) and container_value(node.value):
            containers.update(ast.unparse(each) for each in node.targets)
        elif isinstance(node, FUNCTIONS):
            arguments = node.args
            for argument in arguments.posonlyargs + arguments.args + arguments.kwonlyargs:
                if argument.annotation is None:
                    continue
                if base_name(argument.annotation) in CONTAINERS:
                    containers.add(argument.arg)
    return containers


def string_names(scope):
    names = set()
    if isinstance(scope, FUNCTIONS):
        arguments = scope.args
        for argument in arguments.posonlyargs + arguments.args + arguments.kwonlyargs:
            if argument.annotation is not None and is_string_annotation(argument.annotation):
                names.add(argument.arg)
    for node in ast.walk(scope):
        if isinstance(node, ast.AnnAssign) and is_string_annotation(node.annotation):
            names.add(ast.unparse(node.target))
    return names


def sum_operands(node):
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return sum_operands(node.left) + sum_operands(node.right)
    return [node]


def key_parts(node):
    if isinstance(node, ast.JoinedStr):
        values = node.values
        parts = [each.value for each in values if isinstance(each, ast.FormattedValue)]
        for before, middle, after in zip(values, values[1:], values[2:]):
            text = string_value(middle)
            if (
                isinstance(before, ast.FormattedValue)
                and isinstance(after, ast.FormattedValue)
                and text is not None
                and DELIMITER.match(text)
            ):
                return parts, text
    elif isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        operands = sum_operands(node)
        parts = [each for each in operands if string_value(each) is None]
        for before, middle, after in zip(operands, operands[1:], operands[2:]):
            text = string_value(middle)
            if (
                text is not None
                and DELIMITER.match(text)
                and string_value(before) is None
                and string_value(after) is None
            ):
                return parts, text
    elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        separator = string_value(node.func.value)
        if node.func.attr == "join" and separator and DELIMITER.match(separator):
            if len(node.args) == 1 and isinstance(node.args[0], (ast.List, ast.Tuple)):
                elements = node.args[0].elts
                if not any(isinstance(each, ast.Starred) for each in elements):
                    return [each for each in elements if string_value(each) is None], separator
    return None


def ambiguous(node, strings):
    found = key_parts(node)
    if found is None:
        return None
    parts, separator = found
    texts = [
        each
        for each in parts
        if isinstance(each, ast.Name)
        and each.id in strings
        and not ID_NAME.search(each.id)
    ]
    return separator if len(texts) >= 2 else None


def lookups(tree, containers):
    for node in ast.walk(tree):
        if isinstance(node, ast.Subscript) and ast.unparse(node.value) in containers:
            yield node, node.slice
        elif (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in LOOKUPS
            and node.args
            and ast.unparse(node.func.value) in containers
        ):
            yield node, node.args[0]
        elif (
            isinstance(node, ast.Compare)
            and len(node.ops) == 1
            and isinstance(node.ops[0], (ast.In, ast.NotIn))
            and ast.unparse(node.comparators[0]) in containers
        ):
            yield node, node.left


def single_values(scope):
    values, counts = {}, {}
    for node in ast.walk(scope):
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            if isinstance(node.targets[0], ast.Name):
                name = node.targets[0].id
                values[name] = node.value
                counts[name] = counts.get(name, 0) + 1
    return {name: value for name, value in values.items() if counts[name] == 1}


def check(context):
    if context.tests:
        return []
    containers = declared(context.tree)
    if not containers:
        return []
    found = []
    for node, key in lookups(context.tree, containers):
        scope = scope_of(node, context.parents)
        if isinstance(key, ast.Name):
            key = single_values(scope).get(key.id, key)
        separator = ambiguous(key, string_names(scope))
        if separator is not None:
            subject = shown(ast.unparse(key))
            found.append(finding(context.path, RULE, subject, node))
    return found
