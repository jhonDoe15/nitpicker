import ast

from checks.common import finding, is_type_checking_block
from composition.roots import is_wiring_root
from environment.roots import is_main_guard

RULE = "branch-in-composition-root"
LOOPS = (ast.For, ast.AsyncFor, ast.While)
VALUES = (ast.Constant, ast.JoinedStr, ast.Dict, ast.List, ast.Tuple, ast.Set, ast.Call)
KINDS = {
    ast.If: "if",
    ast.IfExp: "conditional expression",
    ast.Match: "match",
    ast.For: "loop",
    ast.AsyncFor: "loop",
    ast.While: "loop",
}


def is_throw_guard(node):
    return (
        isinstance(node, ast.If)
        and not node.orelse
        and len(node.body) == 1
        and isinstance(node.body[0], ast.Raise)
    )


def guard_tests(tree):
    return {
        id(inner)
        for node in ast.walk(tree)
        if isinstance(node, ast.If) and is_main_guard(node)
        for inner in ast.walk(node.test)
    }


def is_default(node):
    return (
        isinstance(node, ast.BoolOp)
        and isinstance(node.op, ast.Or)
        and isinstance(node.values[-1], VALUES)
    )


def branch_kind(node, context):
    if isinstance(node, ast.If):
        skipped = is_main_guard(node) or is_throw_guard(node)
        return None if skipped or is_type_checking_block(node, context.aliases) else KINDS[ast.If]
    if is_default(node):
        return "default value"
    return KINDS.get(type(node))


def check(context):
    if context.tests or not is_wiring_root(context):
        return []
    tests = guard_tests(context.tree)
    found = []
    for node in ast.walk(context.tree):
        kind = branch_kind(node, context) if id(node) not in tests else None
        if kind is not None:
            found.append(finding(context.path, RULE, kind, node))
    return found
