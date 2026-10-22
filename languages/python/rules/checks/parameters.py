import ast
import re

from checks.common import finding, last_name

RULE = "boolean-flag-parameter"
FIXED_SIGNATURE_DECORATORS = {
    "override",
    "abstractmethod",
    "overload",
    "setter",
    "getter",
    "deleter",
}
BUILDER_NAME = re.compile(r"^(?:set_|with_|from_)|^(?:of|builder)$")
FUNCTION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef)


def is_boolean_annotation(annotation):
    if isinstance(annotation, ast.Constant) and isinstance(annotation.value, str):
        return annotation.value.replace(" ", "") in {
            "bool",
            "bool|None",
            "Optional[bool]",
        }
    if isinstance(annotation, ast.Name):
        return annotation.id == "bool"
    if isinstance(annotation, ast.BinOp):
        return is_boolean_annotation(annotation.left) or is_boolean_annotation(
            annotation.right
        )
    if isinstance(annotation, ast.Subscript) and last_name(annotation.value) in {
        "Optional",
        "Union",
    }:
        return is_boolean_annotation(annotation.slice) or (
            isinstance(annotation.slice, ast.Tuple)
            and any(is_boolean_annotation(item) for item in annotation.slice.elts)
        )
    return False


def is_boolean_literal(node):
    return isinstance(node, ast.Constant) and isinstance(node.value, bool)


def positional_flags(node):
    arguments = node.args
    positional = [*arguments.posonlyargs, *arguments.args]
    defaults = [None] * (len(positional) - len(arguments.defaults)) + list(
        arguments.defaults
    )
    return [
        argument.arg
        for argument, default in zip(positional, defaults, strict=True)
        if is_boolean_literal(default)
        or (
            is_boolean_annotation(argument.annotation)
            and not isinstance(default, ast.Call)
        )
    ]


def selects(test, name):
    if isinstance(test, ast.Name):
        return test.id == name
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        return selects(test.operand, name)
    if isinstance(test, ast.BoolOp):
        return any(selects(value, name) for value in test.values)
    return False


def switches(node, name):
    pending = list(node.body)
    while pending:
        current = pending.pop()
        if isinstance(current, (ast.If, ast.IfExp, ast.While)) and selects(
            current.test, name
        ):
            return True
        if not isinstance(current, (*FUNCTION_TYPES, ast.Lambda, ast.ClassDef)):
            pending.extend(ast.iter_child_nodes(current))
    return False


def has_fixed_signature(node):
    return any(
        last_name(decorator.func if isinstance(decorator, ast.Call) else decorator)
        in FIXED_SIGNATURE_DECORATORS
        for decorator in node.decorator_list
    )


def is_public(node, context):
    if node.name.startswith("_") or BUILDER_NAME.match(node.name):
        return False
    parent = context.parents.get(id(node))
    while parent is not None:
        if isinstance(parent, (*FUNCTION_TYPES, ast.Lambda)):
            return False
        if isinstance(parent, ast.ClassDef) and parent.name.startswith("_"):
            return False
        parent = context.parents.get(id(parent))
    return True


def check(context):
    if context.tests:
        return []
    return [
        finding(context.path, RULE, f"{node.name}({name})", node)
        for node in ast.walk(context.tree)
        if isinstance(node, FUNCTION_TYPES)
        and is_public(node, context)
        and not has_fixed_signature(node)
        for name in positional_flags(node)
        if switches(node, name)
    ]
