import ast
import json
import os
import sys
import warnings

FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
SCOPES = (*FUNCTIONS, ast.ClassDef)
UNITS = (*SCOPES, ast.Lambda)
LAMBDA = "<lambda>"
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


def complexity(body):
    total = 1
    pending = list(body)
    while pending:
        node = pending.pop()
        total += decision_points(node)
        if not isinstance(node, UNITS):
            pending.extend(ast.iter_child_nodes(node))
    return total


def has_decorator(function, name):
    return any(
        getattr(decorator, "id", getattr(decorator, "attr", None)) == name
        for decorator in function.decorator_list
    )


def is_static(function):
    return has_decorator(function, "staticmethod")


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
        "name": ".".join(name for name in (*owners.names, function.name)),
        "start": start,
        "definition": function.lineno,
        "bodyStart": function.body[0].lineno,
        "end": function.end_lineno,
        "lines": function.end_lineno - start + 1 - docstring_lines(function),
        "statements": statements,
        "maxControlNesting": deepest,
        "parameters": parameter_count(function, owners.nodes[-1] if owners.nodes else None),
        "complexity": complexity(function.body),
        "overload": has_decorator(function, "overload"),
    }


def assigned_name(lambda_node, parent):
    if isinstance(parent, ast.Assign) and len(parent.targets) == 1:
        target = parent.targets[0]
    elif isinstance(parent, ast.AnnAssign):
        target = parent.target
    else:
        return LAMBDA
    return target.id if isinstance(target, ast.Name) and parent.value is lambda_node else LAMBDA


def lambda_entry(node, name, owners, statement):
    return {
        "name": ".".join((*owners.names, name)),
        "start": node.lineno,
        "definition": node.lineno,
        "bodyStart": node.body.lineno,
        "end": node.end_lineno,
        "lines": node.end_lineno - node.lineno + 1,
        "statements": 1,
        "maxControlNesting": 0,
        "parameters": parameter_count(node, None),
        "complexity": complexity([node.body]),
        "overload": False,
        "lambda": True,
        "statementLine": statement,
    }


class Owners:
    def __init__(self, nodes=(), names=()):
        self.nodes = nodes
        self.names = names

    def inside(self, node, name):
        return Owners((*self.nodes, node), (*self.names, name))


OUTSIDE_FIELDS = {
    ast.ClassDef: ("bases", "keywords", "decorator_list"),
    ast.FunctionDef: ("args", "decorator_list", "returns"),
    ast.AsyncFunctionDef: ("args", "decorator_list", "returns"),
}


def children_of(node, owners, inner):
    outside = OUTSIDE_FIELDS.get(type(node), ())
    children = []
    for field, value in ast.iter_fields(node):
        for child in value if isinstance(value, list) else [value]:
            if isinstance(child, ast.AST):
                children.append((child, owners if field in outside else inner))
    return children


def statement_line(node):
    decorators = getattr(node, "decorator_list", [])
    return min([node.lineno] + [item.lineno for item in decorators])


def function_entries(module):
    entries = []
    pending = [(module, Owners(), 0, None)]
    while pending:
        node, owners, statement, parent = pending.pop()
        inner = owners
        if isinstance(node, ast.stmt):
            statement = statement_line(node)
        if isinstance(node, FUNCTIONS):
            entries.append(function_entry(node, owners))
            inner = owners.inside(node, node.name)
        elif isinstance(node, ast.ClassDef):
            inner = owners.inside(node, node.name)
        elif isinstance(node, ast.Lambda):
            name = assigned_name(node, parent)
            entries.append(lambda_entry(node, name, owners, statement))
            inner = owners.inside(node, name)
        pending.extend(
            (child, scope, statement, node)
            for child, scope in reversed(children_of(node, owners, inner))
        )
    return sorted(entries, key=lambda entry: (entry["start"], -entry["end"]))


def file_entries(project, relative):
    with open(os.path.join(project, relative), "rb") as handle:
        source = handle.read()
    try:
        module = ast.parse(source, relative)
    except (SyntaxError, ValueError, RecursionError, MemoryError):
        return []
    return [dict(entry, file=relative) for entry in function_entries(module)]


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
