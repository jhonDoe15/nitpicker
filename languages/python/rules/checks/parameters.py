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
    "field_validator",
    "validator",
    "model_validator",
}
FACTORY_DECORATORS = {"classmethod", "staticmethod"}
METHOD_BUILDER_NAME = re.compile(r"^(?:set_|with_)")
FACTORY_NAME = re.compile(r"^(?:from_|of$|builder$)")
FUNCTION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef)
MATCH = getattr(ast, "Match", ())
MATCH_CASE = getattr(ast, "match_case", ())
BOOLEAN_TYPES = {"bool", "None"}
COMPARISONS = (ast.Is, ast.IsNot, ast.Eq, ast.NotEq)


def annotation_members(annotation):
    if isinstance(annotation, ast.Constant) and isinstance(annotation.value, str):
        try:
            parsed = ast.parse(annotation.value.strip(), mode="eval").body
        except SyntaxError:
            return {"?"}
        return annotation_members(parsed)
    if isinstance(annotation, ast.Constant) and annotation.value is None:
        return {"None"}
    if isinstance(annotation, ast.Name):
        return {annotation.id}
    if isinstance(annotation, ast.BinOp) and isinstance(annotation.op, ast.BitOr):
        return annotation_members(annotation.left) | annotation_members(annotation.right)
    if isinstance(annotation, ast.Subscript):
        return subscript_members(annotation)
    return {"?"}


def subscript_members(annotation):
    wrapper = last_name(annotation.value)
    arguments = (
        annotation.slice.elts
        if isinstance(annotation.slice, ast.Tuple)
        else [annotation.slice]
    )
    if wrapper == "Annotated":
        return annotation_members(arguments[0])
    if wrapper in {"Optional", "Union"}:
        members = set()
        for argument in arguments:
            members |= annotation_members(argument)
        return members
    return {"?"}


def is_boolean_annotation(annotation):
    if annotation is None:
        return False
    members = annotation_members(annotation)
    return "bool" in members and members <= BOOLEAN_TYPES


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


def compares_with_literal(test, name):
    if not (
        isinstance(test, ast.Compare)
        and len(test.ops) == 1
        and isinstance(test.ops[0], COMPARISONS)
    ):
        return False
    sides = [test.left, *test.comparators]
    return any(
        isinstance(side, ast.Name) and side.id == name for side in sides
    ) and any(is_boolean_literal(side) for side in sides)


def selects(test, name):
    if isinstance(test, ast.Name):
        return test.id == name
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        return selects(test.operand, name)
    if isinstance(test, ast.BoolOp):
        return any(selects(value, name) for value in test.values)
    return compares_with_literal(test, name)


def conditions(node):
    if isinstance(node, (ast.If, ast.IfExp, ast.While, ast.Assert)):
        return [node.test]
    if isinstance(node, MATCH):
        return [node.subject]
    if isinstance(node, MATCH_CASE):
        return [node.guard] if node.guard is not None else []
    if isinstance(node, ast.comprehension):
        return node.ifs
    return []


def rebinds_parameter(node, name):
    arguments = getattr(node, "args", None)
    if not isinstance(arguments, ast.arguments):
        return False
    every = [
        *arguments.posonlyargs,
        *arguments.args,
        *arguments.kwonlyargs,
        arguments.vararg,
        arguments.kwarg,
    ]
    return any(argument is not None and argument.arg == name for argument in every)


def is_assignment(node, name):
    return (
        isinstance(node, ast.Name)
        and isinstance(node.ctx, ast.Store)
        and node.id == name
    )


def switches(function, name):
    pending = list(function.body)
    found = False
    while pending:
        current = pending.pop()
        if is_assignment(current, name):
            return False
        found = found or any(selects(test, name) for test in conditions(current))
        if not rebinds_parameter(current, name):
            pending.extend(ast.iter_child_nodes(current))
    return found


def has_fixed_signature(node):
    return decorated_with(node, FIXED_SIGNATURE_DECORATORS)


def decorated_with(node, names):
    return any(
        last_name(decorator.func if isinstance(decorator, ast.Call) else decorator)
        in names
        for decorator in node.decorator_list
    )


def is_builder(node, parent):
    if isinstance(parent, ast.ClassDef) and METHOD_BUILDER_NAME.match(node.name):
        return True
    return decorated_with(node, FACTORY_DECORATORS) and bool(
        FACTORY_NAME.match(node.name)
    )


def enclosing_classes(node, context):
    names = []
    parent = context.parents.get(id(node))
    while parent is not None:
        if isinstance(parent, ast.ClassDef):
            names.append(parent.name)
        parent = context.parents.get(id(parent))
    return names[::-1]


def is_public(node, context):
    parent = context.parents.get(id(node))
    if node.name.startswith("_") or is_builder(node, parent):
        return False
    while parent is not None:
        if isinstance(parent, (*FUNCTION_TYPES, ast.Lambda)):
            return False
        if isinstance(parent, ast.ClassDef) and parent.name.startswith("_"):
            return False
        parent = context.parents.get(id(parent))
    return True


def subject(node, name, context):
    owner = ".".join([*enclosing_classes(node, context), node.name])
    return f"{owner}({name})"


def check(context):
    if context.tests:
        return []
    return [
        finding(context.path, RULE, subject(node, name, context), node)
        for node in ast.walk(context.tree)
        if isinstance(node, FUNCTION_TYPES)
        and is_public(node, context)
        and not has_fixed_signature(node)
        for name in positional_flags(node)
        if switches(node, name)
    ]
