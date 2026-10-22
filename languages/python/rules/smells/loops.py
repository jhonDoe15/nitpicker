import ast

from checks.common import finding
from effects.concurrency import is_concurrent, map_is_concurrent
from effects.tables import DATABASE, REMOTE
from smells.io_index import IoScope, chain_names, io_index

COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
PAGING_PASSES = 3


def ancestors(node, parents):
    chain = [node]
    while id(chain[-1]) in parents:
        chain.append(parents[id(chain[-1])])
    return chain


def in_loop_body(parent, child):
    if isinstance(parent, (ast.For, ast.AsyncFor)):
        return child in parent.body
    return isinstance(parent, ast.While) and (
        child in parent.body or child is parent.test
    )


def is_evaluated_once(comprehension, chain, index):
    first = comprehension.generators[0]
    return chain[index - 1] is first and index >= 2 and chain[index - 2] is first.iter


def enclosing_loop(node, parents):
    chain = ancestors(node, parents)
    for index in range(1, len(chain)):
        child, parent = chain[index - 1], chain[index]
        if isinstance(parent, FUNCTIONS):
            return None
        if in_loop_body(parent, child):
            return parent
        if isinstance(parent, COMPREHENSIONS) and not is_evaluated_once(
            parent, chain, index
        ):
            return parent
    return None


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


def reported_kind(effects, concurrent):
    if DATABASE in effects:
        return DATABASE
    if REMOTE in effects and not concurrent:
        return REMOTE
    return None


def subject_of(effects, kind, concurrent):
    parts = [" > ".join(effects[kind]), kind]
    return "|".join(parts + (["concurrent"] if concurrent else []))


def inner_call_ids(tree):
    return {
        id(node.func.value)
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }


def check(context):
    if context.tests:
        return []
    scope = IoScope(context, io_index(context.project))
    found = []
    inner_calls = inner_call_ids(context.tree)
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call) or id(node) in inner_calls:
            continue
        mapped = scope.map_effects(node)
        if mapped:
            concurrent = map_is_concurrent(node, context)
            kind = reported_kind(mapped, concurrent)
            if kind is not None:
                found.append(
                    finding(
                        context.path,
                        "io-in-loop",
                        subject_of(mapped, kind, concurrent),
                        node,
                    )
                )
            continue
        effects = scope.effects(node)
        loop = enclosing_loop(node, context.parents) if effects else None
        if loop is None:
            continue
        concurrent = is_concurrent(node, loop, context)
        kind = reported_kind(effects, concurrent)
        if kind is None or skipped_loop(node, loop, scope, context.parents):
            continue
        subject = subject_of(effects, kind, concurrent)
        found.append(finding(context.path, "io-in-loop", subject, node))
    return found


def skipped_loop(call, loop, scope, parents):
    return (
        is_paging_loop(loop, scope)
        or is_retry_attempt(call, loop, parents)
        or runs_each_item(call, loop)
    )
