import ast

from signatures.annotations import FUNCTION_TYPES

SELF = "self"


def argument_names(node):
    arguments = node.args
    every = [
        *arguments.posonlyargs,
        *arguments.args,
        *arguments.kwonlyargs,
        arguments.vararg,
        arguments.kwarg,
    ]
    return {argument.arg for argument in every if argument is not None}


def comprehension_targets(node):
    return {
        name.id
        for generator in node.generators
        for name in ast.walk(generator.target)
        if isinstance(name, ast.Name)
    }


def shadows(node, name):
    if isinstance(node, (ast.Lambda, *FUNCTION_TYPES)):
        return name in argument_names(node)
    if isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
        return name in comprehension_targets(node)
    return False


def visible_nodes(function, name):
    found, pending = [], [function]
    while pending:
        node = pending.pop()
        found.append(node)
        pending.extend(
            child for child in ast.iter_child_nodes(node) if not shadows(child, name)
        )
    return sorted(
        found,
        key=lambda node: (getattr(node, "lineno", 0), getattr(node, "col_offset", 0)),
    )


def position(node):
    return (node.lineno, node.col_offset)


def key_of(node):
    if isinstance(node, ast.Name):
        return node.id
    if (
        isinstance(node, ast.Attribute)
        and isinstance(node.value, ast.Name)
        and node.value.id == SELF
    ):
        return f"{SELF}.{node.attr}"
    return None
