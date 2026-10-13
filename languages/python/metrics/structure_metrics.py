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


DECISIONS = tuple(
    getattr(ast, name)
    for name in ("If", "IfExp", "For", "AsyncFor", "While", "ExceptHandler")
    if hasattr(ast, name)
)


MATCH_CASE = getattr(ast, "match_case", ())


def has_docstring(body):
    first = body[0]
    return (
        isinstance(first, ast.Expr)
        and isinstance(first.value, ast.Constant)
        and isinstance(first.value.value, str)
    )


def blocks_of(node):
    return [child for child in ast.iter_child_nodes(node) if isinstance(child, BLOCKS)]


def docstring_lines(function):
    if not has_docstring(function.body):
        return 0
    docstring = function.body[0]
    return docstring.end_lineno - docstring.lineno + 1


def elif_branch(parent, child):
    return (
        isinstance(parent, ast.If)
        and isinstance(child, ast.If)
        and parent.orelse == [child]
        and child.col_offset == parent.col_offset
    )


def nested_depth(node, parent, depth):
    return depth + (isinstance(node, CONTROL) and not elif_branch(parent, node))


def body_metrics(function):
    body = function.body[1:] if has_docstring(function.body) else function.body
    statements = 0
    deepest = 0
    pending = [(statement, function, 0) for statement in body]
    while pending:
        node, parent, depth = pending.pop()
        depth = nested_depth(node, parent, depth)
        deepest = max(deepest, depth)
        statements += isinstance(node, ast.stmt)
        if not isinstance(node, SCOPES):
            pending.extend((child, node, depth) for child in blocks_of(node))
    return statements, deepest


def is_wildcard(case):
    return (
        case.guard is None
        and isinstance(case.pattern, ast.MatchAs)
        and case.pattern.pattern is None
    )


def decision_points(node):
    if isinstance(node, ast.BoolOp):
        return len(node.values) - 1
    if isinstance(node, MATCH_CASE):
        return 0 if is_wildcard(node) else 1
    if isinstance(node, ast.comprehension):
        return 1 + len(node.ifs)
    return isinstance(node, DECISIONS)


def complexity(function):
    total = 1
    pending = list(function.body)
    while pending:
        node = pending.pop()
        total += decision_points(node)
        if not isinstance(node, SCOPES):
            pending.extend(ast.iter_child_nodes(node))
    return total


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
        "definition": function.lineno,
        "bodyStart": function.body[0].lineno,
        "end": function.end_lineno,
        "lines": function.end_lineno - start + 1 - docstring_lines(function),
        "statements": statements,
        "maxControlNesting": deepest,
        "parameters": parameter_count(function, owners[-1] if owners else None),
        "complexity": complexity(function),
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
    except (SyntaxError, ValueError, RecursionError, MemoryError):
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
