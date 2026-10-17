import ast
import json
import os
import sys
import warnings

from class_metrics import FUNCTIONS, SCOPES, blocks_of, class_entries, first_line, has_decorator

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
    return has_decorator(function, "staticmethod")


def parameter_count(function, owner):
    arguments = function.args
    positional = arguments.posonlyargs + arguments.args
    count = len(positional) + len(arguments.kwonlyargs)
    count += (arguments.vararg is not None) + (arguments.kwarg is not None)
    is_method = isinstance(owner, ast.ClassDef) and not is_static(function)
    return count - (1 if is_method and positional else 0)


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
        "overload": has_decorator(function, "overload"),
    }


def function_entries(module):
    entries = []
    pending = [(child, ()) for child in reversed(blocks_of(module))]
    while pending:
        node, owners = pending.pop()
        if isinstance(node, FUNCTIONS):
            entries.append(function_entry(node, owners))
        inner = (*owners, node) if isinstance(node, SCOPES) else owners
        pending.extend((child, inner) for child in reversed(blocks_of(node)))
    return entries


def import_entries(module):
    entries = []
    for node in ast.walk(module):
        if isinstance(node, ast.Import):
            entries.extend({"module": a.name, "asname": a.asname} for a in node.names)
        elif isinstance(node, ast.ImportFrom):
            entries.extend(
                {"level": node.level, "module": node.module, "name": a.name, "asname": a.asname}
                for a in node.names
            )
    return entries


def parse_file(project, relative):
    with open(os.path.join(project, relative), "rb") as handle:
        source = handle.read()
    try:
        return ast.parse(source, relative)
    except (SyntaxError, ValueError, RecursionError, MemoryError):
        return None


def file_entries(project, relative):
    module = parse_file(project, relative)
    if module is None:
        return [], None
    functions = [dict(entry, file=relative) for entry in function_entries(module)]
    classes = [dict(entry, file=relative) for entry in class_entries(module)]
    return functions, {"classes": classes, "imports": import_entries(module)}


def main(arguments):
    output, project, listing, *classes_output = arguments
    warnings.simplefilter("ignore")
    with open(listing, encoding="utf-8") as handle:
        files = [line for line in handle.read().split("\n") if line]
    entries = []
    classes = {}
    for relative in files:
        functions, described = file_entries(project, relative)
        entries.extend(functions)
        if described is not None:
            classes[relative] = described
    with open(output, "w", encoding="utf-8") as handle:
        json.dump(entries, handle)
    if classes_output:
        with open(classes_output[0], "w", encoding="utf-8") as handle:
            json.dump(classes, handle)


if __name__ == "__main__":
    main(sys.argv[1:])
