import ast

from checks.common import own_nodes

EXITS = (ast.Break, ast.Return, ast.Raise)
LITERALS = (ast.Tuple, ast.List)
SMALL = 8


def is_small_literal(loop):
    if not isinstance(loop, (ast.For, ast.AsyncFor)):
        return False
    return (
        isinstance(loop.iter, LITERALS)
        and len(loop.iter.elts) <= SMALL
        and all(isinstance(item, ast.Constant) for item in loop.iter.elts)
    )


def always_exits(loop):
    body = loop.body
    if not body or not isinstance(body[-1], EXITS):
        return False
    return not any(isinstance(n, ast.Continue) for n in own_nodes(loop))


def exits_after(node, parents):
    parent = parents.get(id(node))
    for field in ("body", "orelse", "finalbody"):
        block = getattr(parent, field, None)
        if isinstance(block, list) and node in block:
            return any(isinstance(item, EXITS) for item in block[block.index(node) + 1 :])
    return False


def runs_once(node, loop, parents):
    return is_small_literal(loop) or always_exits(loop) or exits_after(node, parents)
