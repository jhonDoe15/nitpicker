import ast

from fixers.extract.support.align import Alignment
from fixers.extract.support.render import (
    call_text,
    has_value_return,
    helper_name,
    hole_argument,
    hole_names,
    indentation,
    insertion,
    newline_of,
    replaced_body,
)
from fixers.extract.support.scopes import bound_names, comments_in, forbidden, identifiers
from fixers.extract.support.hierarchy import method_problem, subclass_problem
from fixers.extract.units import label_stem
from source_text import refuse


def is_docstring(statement):
    return (
        isinstance(statement, ast.Expr)
        and isinstance(statement.value, ast.Constant)
        and isinstance(statement.value.value, str)
    )


def statements_of(function):
    body = function.body
    return body[1:] if is_docstring(body[0]) else body


def plain_signature(function):
    arguments = function.args
    if function.decorator_list:
        refuse("a function has decorators")
    if arguments.posonlyargs or arguments.vararg or arguments.kwonlyargs or arguments.kwarg:
        refuse("a function has positional-only, keyword-only or variadic parameters")


def same_container(functions, containers):
    if containers[0] is not containers[1]:
        refuse("the copies are not in one class or module")
    if isinstance(functions[0], ast.AsyncFunctionDef) != isinstance(
        functions[1], ast.AsyncFunctionDef
    ):
        refuse("only one copy is async")
    if isinstance(containers[0], ast.ClassDef):
        method_problem(functions, containers)


def dump(node):
    return ast.dump(node) if node is not None else None


def signature_problem(functions):
    first, second = functions
    left, right = first.args.args, second.args.args
    if len(left) != len(right):
        refuse("the copies take different numbers of parameters")
    if any(dump(a.annotation) != dump(b.annotation) for a, b in zip(left, right)):
        refuse("the copies annotate a parameter differently")
    if dump(first.returns) != dump(second.returns):
        refuse("the copies return different types")


def comment_problem(source, functions):
    lines = []
    for function in functions:
        statements = statements_of(function)
        lines.append(comments_in(source.text, statements[0].lineno, statements[-1].end_lineno))
    if not set(lines[1]) <= set(lines[0]):
        refuse("the second copy has comments the shared function would drop")


def docstring_difference(functions):
    docs = [f.body[0] for f in functions if is_docstring(f.body[0])]
    return int(len(docs) == 2 and docs[0].value.value != docs[1].value.value)


def aligned_holes(functions, statements, expected):
    alignment = Alignment(tuple(bound_names(function) for function in functions))
    for left, right in zip(*(function.args.args for function in functions)):
        if not alignment.bind(left.arg, right.arg):
            refuse("the copies rename a parameter inconsistently")
    holes = alignment.run(zip(*statements))
    if len({hole.key[:2] for hole in holes}) + docstring_difference(functions) != expected:
        refuse("the differing values do not match the ones the rule found")
    return holes


def checked_statements(source, functions, containers):
    first = functions[0]
    for function in functions:
        plain_signature(function)
    same_container(functions, containers)
    signature_problem(functions)
    statements = [statements_of(function) for function in functions]
    if len(statements[0]) != len(statements[1]):
        refuse("the copies have different numbers of statements")
    for function, body in zip(functions, statements):
        forbidden(body + function.args.defaults)
        indentation(source, body[0])
    comment_problem(source, functions)
    return statements


def edits_for(source, request, statements, holes):
    functions, containers = request["functions"], request["containers"]
    method = isinstance(containers[0], ast.ClassDef)
    first = functions[0]
    taken = identifiers(source.tree) | request["claimed"]
    name = helper_name(label_stem(request["label"]), taken)
    names = hole_names(holes, taken | {name})
    request["claimed"].add(name)
    if method:
        subclass_problem(containers[0], name, request["project"])
    annotated = first.returns is not None or any(a.annotation for a in first.args.args)
    extras = [f"{n}: {h.kind}" if annotated else n for h, n in zip(holes, names)]
    parameters = [source.source_of(argument) for argument in first.args.args] + extras
    returns = "" if first.returns is None else f" -> {source.source_of(first.returns)}"
    keyword = "async def" if isinstance(first, ast.AsyncFunctionDef) else "def"
    body = replaced_body(source, statements[0], holes, names)
    helper = f"{keyword} {name}({', '.join(parameters)}){returns}:{newline_of(source)}"
    helper += indentation(source, statements[0][0]) + body
    mode = {
        "async": isinstance(first, ast.AsyncFunctionDef),
        "returns": has_value_return(statements[0]),
    }
    edits = []
    for side, function in enumerate(functions):
        own = [argument.arg for argument in function.args.args]
        values = [hole_argument(source, hole, side) for hole in holes]
        callee = f"{own[0]}.{name}" if method else name
        call = call_text(callee, (own[1:] if method else own) + values, mode)
        start, _ = source.span(statements[side][0])
        _, end = source.span(statements[side][-1])
        edits.append((start, end, call))
    edits.append(insertion(source, first, indentation(source, first) + helper, method))
    return edits


def extract(source, request):
    statements = checked_statements(source, request["functions"], request["containers"])
    holes = aligned_holes(request["functions"], statements, request["holes"])
    return edits_for(source, request, statements, holes)
