import ast
import json
import os
import sys
import warnings

FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
SCOPES = (*FUNCTIONS, ast.ClassDef)
BLOCKS = tuple(
    getattr(ast, name)
    for name in ("stmt", "excepthandler", "match_case")
    if hasattr(ast, name)
)
CONTROL = tuple(
    getattr(ast, name)
    for name in ("If", "For", "AsyncFor", "While", "Match", "ExceptHandler")
    if hasattr(ast, name)
)


def has_docstring(body):
    first = body[0]
    return (
        isinstance(first, ast.Expr)
        and isinstance(first.value, ast.Constant)
        and isinstance(first.value.value, str)
    )


def blocks_of(node):
    return [child for child in ast.iter_child_nodes(node) if isinstance(child, BLOCKS)]


def body_metrics(function):
    body = function.body[1:] if has_docstring(function.body) else function.body
    statements = 0
    deepest = 0
    pending = [(statement, 0) for statement in body]
    while pending:
        node, depth = pending.pop()
        depth += isinstance(node, CONTROL)
        deepest = max(deepest, depth)
        statements += isinstance(node, ast.stmt)
        if not isinstance(node, SCOPES):
            pending.extend((child, depth) for child in blocks_of(node))
    return statements, deepest


def is_static(function):
    return any(
        getattr(decorator, "id", getattr(decorator, "attr", None)) == "staticmethod"
        for decorator in function.decorator_list
    )


def parameter_count(function, owner):
    arguments = function.args
    positional = arguments.posonlyargs + arguments.args
    count = len(positional) + len(arguments.kwonlyargs)
    count += (arguments.vararg is not None) + (arguments.kwarg is not None)
    is_method = isinstance(owner, ast.ClassDef) and not is_static(function)
    return count - (1 if is_method and positional else 0)


def first_line(function):
    return min([function.lineno] + [item.lineno for item in function.decorator_list])


def function_entry(function, owners):
    statements, deepest = body_metrics(function)
    start = first_line(function)
    return {
        "name": ".".join(owner.name for owner in (*owners, function)),
        "start": start,
        "end": function.end_lineno,
        "lines": function.end_lineno - start + 1,
        "statements": statements,
        "maxControlNesting": deepest,
        "parameters": parameter_count(function, owners[-1] if owners else None),
    }


def function_entries(node, owners):
    for child in blocks_of(node):
        if isinstance(child, FUNCTIONS):
            yield function_entry(child, owners)
        inner = (*owners, child) if isinstance(child, SCOPES) else owners
        yield from function_entries(child, inner)


def file_entries(project, relative):
    with open(os.path.join(project, relative), "rb") as handle:
        source = handle.read()
    try:
        module = ast.parse(source, relative)
    except (SyntaxError, ValueError):
        return []
    return [dict(entry, file=relative) for entry in function_entries(module, ())]


def main(arguments):
    output, project, listing = arguments
    warnings.simplefilter("ignore")
    with open(listing, encoding="utf-8") as handle:
        files = [line for line in handle.read().split("\n") if line]
    entries = []
    for relative in files:
        entries.extend(file_entries(project, relative))
    with open(output, "w", encoding="utf-8") as handle:
        json.dump(entries, handle)


if __name__ == "__main__":
    main(sys.argv[1:])
