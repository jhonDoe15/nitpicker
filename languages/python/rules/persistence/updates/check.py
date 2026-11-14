import ast

from checks.common import finding
from persistence.memory.check import enclosing, is_known, is_skipped
from persistence.updates.hooks import has_hooks
from persistence.updates.rows import DJANGO, rows_of
from persistence.updates.loops import (
    assignment_of,
    calls_after,
    commits,
    fixed_assignments,
    reads,
    saves_back,
)

RULE = "in-memory-update"
GUARDED = True
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
DJANGO_READS = 2
BLOCKS = ("body", "orelse", "finalbody")


def following(loop, context):
    parent = context.parents.get(id(loop))
    for name in BLOCKS:
        block = getattr(parent, name, None)
        if isinstance(block, list) and loop in block:
            return block[block.index(loop) + 1 :]
    return []


def source_of(loop, function):
    if isinstance(loop.iter, ast.Name):
        return loop.iter.id, assignment_of(function, loop.iter.id)
    return None, loop.iter


def written_back(shape, name, tail, function):
    calls = calls_after(tail)
    if shape == DJANGO:
        saved = saves_back(calls, name)
        return saved is not None and len(reads(function, name)) == DJANGO_READS
    return commits(calls) is not None and (
        name is None or len(reads(function, name)) == 1
    )


def loop_finding(loop, function, context):
    fields = fixed_assignments(loop)
    name, value = source_of(loop, function)
    found = rows_of(value, context) if fields and value is not None else None
    if found is None:
        return None
    result, shape = found
    if shape == DJANGO and name is None:
        return None
    if not written_back(shape, name, following(loop, context), function):
        return None
    if not is_known(context, result.model, set(fields)) or has_hooks(
        context, result.model
    ):
        return None
    subject = f"{result.model}|{','.join(dict.fromkeys(fields))}|{shape}"
    return finding(context.path, RULE, subject, loop)


def check(context):
    if is_skipped(context):
        return []
    found = []
    for node in ast.walk(context.tree):
        function = (
            enclosing(node, context, FUNCTIONS) if isinstance(node, ast.For) else None
        )
        item = loop_finding(node, function, context) if function is not None else None
        if item is not None:
            found.append(item)
    return found
