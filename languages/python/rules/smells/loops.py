import ast

from checks.common import dotted_name, finding
from checks.loop_scope import COMPREHENSIONS, enclosing_loop
from concurrency.bounds import callee_name, sized_collection
from concurrency.fan_out import reported_work
from concurrency.remote import is_task_call, remote_of
from smells.io_index import IoScope, chain_names, io_index

CONCURRENT_COMBINATORS = {"asyncio.gather", "asyncio.wait", "asyncio.as_completed"}
PAGING_PASSES = 3


def is_concurrent(comprehension, parents, aliases):
    node = parents.get(id(comprehension))
    if isinstance(node, ast.Starred):
        node = parents.get(id(node))
    return (
        isinstance(node, ast.Call)
        and dotted_name(node.func, aliases) in CONCURRENT_COMBINATORS
    )


def is_pool_worker(call, loop, context):
    parent = context.parents.get(id(call))
    if not (is_task_call(parent, context.aliases) and call in parent.args):
        return False
    iterable = loop.generators[0].iter if isinstance(loop, COMPREHENSIONS) else None
    if isinstance(loop, (ast.For, ast.AsyncFor)):
        iterable = loop.iter
    return (
        isinstance(iterable, ast.Call)
        and callee_name(iterable) == "range"
        and sized_collection(iterable, remote_of(context)) is None
    )


def assigned_pairs(loop):
    for node in ast.walk(loop):
        if isinstance(node, ast.Assign):
            yield node.targets, node.value
        elif isinstance(node, (ast.AugAssign, ast.AnnAssign)) and node.value:
            yield [node.target], node.value


def names_in(node):
    return {n.id for n in ast.walk(node) if isinstance(n, ast.Name)}


def input_output_names(loop, scope):
    found = set()
    for _ in range(PAGING_PASSES):
        for targets, value in assigned_pairs(loop):
            reads_input_output = any(
                isinstance(n, ast.Call) and scope.is_io(n) for n in ast.walk(value)
            )
            if reads_input_output or names_in(value) & found:
                found.update(
                    t.id
                    for target in targets
                    for t in ast.walk(target)
                    if isinstance(t, ast.Name)
                )
    return found


def tested_names(loop):
    names = names_in(loop.test)
    for node in ast.walk(loop):
        if isinstance(node, ast.If) and ends_with_exit_statement(node.body):
            names |= names_in(node.test)
    return names


def ends_with_exit_statement(body):
    return bool(body) and isinstance(body[-1], (ast.Break, ast.Return))


def is_paging_loop(loop, scope):
    if not isinstance(loop, ast.While):
        return False
    return bool(tested_names(loop) & input_output_names(loop, scope))


def loop_variables(loop):
    targets = []
    if isinstance(loop, (ast.For, ast.AsyncFor)):
        targets = [loop.target]
    elif isinstance(loop, COMPREHENSIONS):
        targets = [g.target for g in loop.generators]
    return {n.id for t in targets for n in ast.walk(t) if isinstance(n, ast.Name)}


def runs_each_item(call, loop):
    names = chain_names(call.func)
    return (
        bool(names)
        and names[-1] == "execute"
        and bool(call.args)
        and isinstance(call.args[0], ast.Name)
        and call.args[0].id in loop_variables(loop)
    )


def exits_loop(statements):
    return any(
        isinstance(n, (ast.Return, ast.Break)) for s in statements for n in ast.walk(s)
    )


def is_retry_attempt(call, loop, parents):
    if not isinstance(loop, (ast.For, ast.AsyncFor, ast.While)):
        return False
    node = call
    while node is not None and node is not loop:
        parent = parents.get(id(node))
        if isinstance(parent, ast.Try) and node in parent.body and parent in loop.body:
            handlers_continue = all(
                not any(
                    isinstance(n, (ast.Raise, ast.Return, ast.Break))
                    for s in h.body
                    for n in ast.walk(s)
                )
                for h in parent.handlers
            )
            return (
                bool(parent.handlers) and handlers_continue and exits_loop(parent.body)
            )
        node = parent
    return False


def check(context):
    if context.tests:
        return []
    scope = IoScope(context, io_index(context.project))
    parents = context.parents
    found = []
    fanned_out = reported_work(context)
    inner_calls = {
        id(node.func.value)
        for node in ast.walk(context.tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call) or id(node) in inner_calls:
            continue
        if scope.maps_io(node) and id(node) not in fanned_out:
            callee = ".".join(chain_names(node.args[0]))
            found.append(finding(context.path, "io-in-loop", f"{callee}()", node))
            continue
        if not scope.is_io(node):
            continue
        loop = enclosing_loop(node, parents)
        if loop is None:
            continue
        if isinstance(loop, COMPREHENSIONS) and is_concurrent(
            loop, parents, context.aliases
        ):
            continue
        if id(node) in fanned_out or is_pool_worker(node, loop, context):
            continue
        if (
            is_paging_loop(loop, scope)
            or is_retry_attempt(node, loop, parents)
            or runs_each_item(node, loop)
        ):
            continue
        callee = ".".join(chain_names(node.func))
        found.append(finding(context.path, "io-in-loop", f"{callee}()", node))
    return found
