import ast

from checks.common import walk_statements
from effects.tables import DATABASE, MESSAGE, WRITE
from security.resolve.scopes import values_of, where_of

LOOPS = (ast.For, ast.AsyncFor)


def loop_of(node, function, parents):
    current = parents.get(id(node))
    while current is not None and current is not function:
        if isinstance(current, LOOPS):
            return current
        current = parents.get(id(current))
    return None


def mentions(node, names):
    return any(isinstance(n, ast.Name) and n.id in names for n in ast.walk(node))


def target_names(loop):
    return {n.id for n in ast.walk(loop.target) if isinstance(n, ast.Name)}


def reads_database(loop, scope):
    sources = [loop.iter]
    if isinstance(loop.iter, ast.Name):
        where = where_of(loop.iter, scope.context)
        sources += [value for value, _ in values_of(loop.iter.id, where)]
    return any(
        isinstance(node, ast.Call) and DATABASE in scope.effects(node)
        for source in sources
        for node in ast.walk(source)
    )


def inside(loop, node):
    start = (loop.lineno, loop.col_offset)
    end = (loop.end_lineno, loop.end_col_offset)
    return start <= (node.lineno, node.col_offset) <= end


def after(first, second):
    return (second.lineno, second.col_offset) > (first.lineno, first.col_offset)


def relay_sites(sites, function, scope):
    exempt = set()
    parents = scope.context.parents
    for message in (site for site in sites if MESSAGE in site.effects):
        loop = loop_of(message.node, function, parents)
        if loop is None or not reads_database(loop, scope):
            continue
        names = target_names(loop)
        if not mentions(message.node, names):
            continue
        marks = [
            site
            for site in sites
            if WRITE in site.effects
            and site.node is not message.node
            and inside(loop, site.node)
            and after(message.node, site.node)
            and mentions(site.node, names)
        ]
        if marks:
            exempt.add(id(message.node))
            exempt.update(id(mark.node) for mark in marks)
    return exempt


def is_relay_mark(call, effects, loop, scope):
    if WRITE not in effects or not isinstance(loop, LOOPS):
        return False
    names = target_names(loop)
    if not mentions(call, names) or not reads_database(loop, scope):
        return False
    return any(
        isinstance(node, ast.Call)
        and after(node, call)
        and mentions(node, names)
        and MESSAGE in scope.effects(node)
        for node in walk_statements(loop.body)
    )
