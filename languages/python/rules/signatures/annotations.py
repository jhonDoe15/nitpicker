import ast

from checks.common import last_name

FUNCTION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef)
UNION_WRAPPERS = {"Union"}
OPTIONAL_WRAPPERS = {"Optional"}
TRANSPARENT_WRAPPERS = {
    "Annotated",
    "Final",
    "ClassVar",
    "Required",
    "NotRequired",
    "ReadOnly",
    "InitVar",
}
NONE_MEMBER = "None"
HOOK_PREFIX = "pytest_"
MAX_ANNOTATION_DEPTH = 24


def subscript_arguments(annotation):
    inner = annotation.slice
    return inner.elts if isinstance(inner, ast.Tuple) else [inner]


def subscript_members(annotation, depth):
    wrapper = last_name(annotation.value)
    arguments = subscript_arguments(annotation)
    if wrapper in UNION_WRAPPERS or wrapper in OPTIONAL_WRAPPERS:
        members = [
            name for argument in arguments for name in members_of(argument, depth + 1)
        ]
        return [*members, NONE_MEMBER] if wrapper in OPTIONAL_WRAPPERS else members
    if wrapper in TRANSPARENT_WRAPPERS:
        return members_of(arguments[0], depth + 1) if arguments else []
    return [wrapper] if wrapper else []


def string_members(annotation, depth):
    try:
        parsed = ast.parse(annotation.value.strip(), mode="eval").body
    except (SyntaxError, ValueError, RecursionError, MemoryError):
        return []
    return members_of(parsed, depth + 1)


def members_of(annotation, depth=0):
    if annotation is None or depth > MAX_ANNOTATION_DEPTH:
        return []
    if isinstance(annotation, ast.Constant):
        if isinstance(annotation.value, str):
            return string_members(annotation, depth)
        return [NONE_MEMBER] if annotation.value is None else []
    if isinstance(annotation, ast.BinOp) and isinstance(annotation.op, ast.BitOr):
        return members_of(annotation.left, depth + 1) + members_of(
            annotation.right, depth + 1
        )
    if isinstance(annotation, ast.Subscript):
        return subscript_members(annotation, depth)
    name = last_name(annotation)
    return [name] if name else []


def is_tri_state(annotation):
    members = set(members_of(annotation))
    return (
        "bool" in members
        and NONE_MEMBER in members
        and members <= {"bool", NONE_MEMBER}
    )


def parameters_of(function):
    arguments = function.args
    return [*arguments.posonlyargs, *arguments.args, *arguments.kwonlyargs]


def defaults_of(function):
    arguments = function.args
    positional = [*arguments.posonlyargs, *arguments.args]
    padding = [None] * (len(positional) - len(arguments.defaults))
    return dict(
        zip(
            [argument.arg for argument in positional + arguments.kwonlyargs],
            [*padding, *arguments.defaults, *arguments.kw_defaults],
            strict=True,
        )
    )


def decorator_names(node):
    return {
        last_name(item.func if isinstance(item, ast.Call) else item)
        for item in node.decorator_list
    }


def qualified_name(node, context):
    names = [node.name]
    parent = context.parents.get(id(node))
    while parent is not None:
        if isinstance(parent, (*FUNCTION_TYPES, ast.ClassDef)):
            names.append(parent.name)
        parent = context.parents.get(id(parent))
    return ".".join(reversed(names))


def is_hook(function):
    return function.name.startswith(HOOK_PREFIX)
