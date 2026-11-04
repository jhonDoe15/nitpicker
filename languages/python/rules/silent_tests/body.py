import ast

from checks.common import dotted_name
from silent_tests.calls import (
    DEFINITIONS,
    SCOPES,
    called_name,
    is_assertion_node,
    is_fixture,
    is_self,
    is_test_function,
    own_nodes,
)
from silent_tests.shapes import (
    blind_names,
    body_of,
    construct_kind,
    disguised,
    invoked,
    is_irrefutable,
    is_suppress,
    nested_callables,
)
from syntax.folding import Folder
from syntax.walk import if_chain

ASSERT, FAIL, SKIP = "assert", "fail", "skip"
SKIP_CALLS = {"pytest.skip", "pytest.xfail", "pytest.importorskip", "pytest.exit"}
START = (None, None, frozenset())


class Scan:
    def __init__(self, context, helpers):
        self.aliases = context.aliases
        self.helpers = helpers
        self.folder = Folder(context.tree, context.aliases)
        self.local = set()
        self.methods = set()
        self.nested = {}


def classify(node, scan):
    if isinstance(node, ast.Assert):
        return FAIL if scan.folder.truthiness(node.test) is False else ASSERT
    if isinstance(node, ast.Raise):
        return FAIL if is_assertion_node(node, scan.aliases, scan.helpers) else None
    if isinstance(node, ast.Call):
        return classify_call(node, scan)
    if isinstance(node, ast.With):
        return ASSERT if is_assertion_node(node, scan.aliases, scan.helpers) else None
    return None


def classify_call(call, scan):
    func = call.func
    resolved = dotted_name(func, scan.aliases) or ""
    attribute = func.attr.lower() if isinstance(func, ast.Attribute) else ""
    on_self = isinstance(func, ast.Attribute) and is_self(func.value)
    if resolved in SKIP_CALLS or (on_self and attribute == "skiptest"):
        return SKIP
    if resolved == "pytest.fail" or (on_self and attribute == "fail"):
        return FAIL
    if is_assertion_node(call, scan.aliases, scan.helpers):
        return ASSERT
    if isinstance(func, ast.Name) and func.id in scan.local:
        return ASSERT
    if on_self and func.attr in scan.methods:
        return ASSERT
    named = called_name(func, scan.aliases, scan.helpers["modules"])
    return ASSERT if named in scan.helpers["names"] else None


def is_callback(node, scan):
    return isinstance(node, ast.Name) and (
        node.id in scan.local or node.id in scan.helpers["names"]
    )


def terminates(body, scan):
    for statement in body:
        if isinstance(statement, ast.Raise):
            return True
        if isinstance(statement, (ast.Expr, ast.Assert)):
            node = statement.value if isinstance(statement, ast.Expr) else statement
            if classify(node, scan) in (FAIL, SKIP):
                return True
        if isinstance(statement, ast.If) and branches_terminate(statement, scan):
            return True
    return False


def branches_terminate(statement, scan):
    _, bodies, final = if_chain(statement)
    return bool(final) and all(terminates(body, scan) for body in [*bodies, final])


def sole_passing(bodies, exhaustive, scan):
    if not exhaustive:
        return None
    passing = [i for i, body in enumerate(bodies) if not terminates(body, scan)]
    return passing[0] if len(passing) == 1 else None


def swallows(handler, aliases, scan):
    caught = handler.type
    if caught is None:
        blind = True
    else:
        caught = caught.elts if isinstance(caught, ast.Tuple) else [caught]
        blind = bool(blind_names(caught, aliases))
    return blind and not terminates(handler.body, scan)


def children(node, state, scan):
    kind, outer, caught = state
    if isinstance(node, ast.If):
        return branch_children(node, state, scan)
    if isinstance(node, ast.Match):
        return match_children(node, state, scan)
    if isinstance(node, ast.ExceptHandler) and node.name:
        caught = caught | {node.name}
    construct = construct_kind(node)
    if construct is not None and kind is None:
        kind, outer = construct, node
    inner = (kind, outer, caught)
    if isinstance(node, (ast.With, ast.AsyncWith)):
        return with_children(node, state, scan)
    if isinstance(node, (ast.Try, getattr(ast, "TryStar", ast.Try))):
        return try_children(node, state, scan)
    return [(child, inner) for child in ast.iter_child_nodes(node)]


def with_children(node, state, scan):
    suppressing = any(is_suppress(item, scan.aliases) for item in node.items)
    body_state = suppressed(state, node) if suppressing else state
    return [(item, state) for item in node.items] + [
        (statement, body_state) for statement in node.body
    ]


def suppressed(state, node):
    return state if state[0] is not None else ("suppress", node, state[2])


def try_children(node, state, scan):
    swallowing = any(swallows(handler, scan.aliases, scan) for handler in node.handlers)
    body_state = suppressed(state, node) if swallowing else state
    out = [(statement, body_state) for statement in node.body]
    out += [(handler, state) for handler in node.handlers]
    return out + [(statement, state) for statement in [*node.orelse, *node.finalbody]]


def branch_children(node, state, scan):
    tests, bodies, final = if_chain(node)
    every = [*bodies, final] if final else bodies
    kind, outer, caught = state
    inner = state if kind is not None else ("if", node, caught)
    chosen = sole_passing(every, bool(final), scan)
    out = [(test, state) for test in tests]
    for index, body in enumerate(every):
        branch_state = state if chosen == index else inner
        out.extend((statement, branch_state) for statement in body)
    return out


def match_children(node, state, scan):
    kind, outer, caught = state
    inner = state if kind is not None else ("match", node, caught)
    bodies = [case.body for case in node.cases]
    exhaustive = bool(node.cases) and is_irrefutable(node.cases[-1])
    chosen = sole_passing(bodies, exhaustive, scan)
    out = [(node.subject, state)]
    for index, case in enumerate(node.cases):
        branch_state = state if chosen == index else inner
        out.append((case.pattern, state))
        if case.guard is not None:
            out.append((case.guard, state))
        out.extend((statement, branch_state) for statement in case.body)
    return out


def analyze(function, scan):
    scan.nested = nested_callables(function)
    records = []
    entered = set()
    stack = [(statement, START) for statement in reversed(function.body)]
    while stack:
        node, state = stack.pop()
        if isinstance(node, SCOPES):
            continue
        kind = classify(node, scan)
        if kind is not None:
            records.append((kind, *state[:2], node, state[2]))
            hidden = disguised(node) if kind == ASSERT and state[0] is None else None
            if hidden:
                records.append((ASSERT, hidden, node, node, state[2]))
            if not isinstance(node, ast.With):
                continue
        if isinstance(node, ast.Call):
            for argument in node.args:
                if is_callback(argument, scan):
                    records.append((ASSERT, *state[:2], argument, state[2]))
            for target in invoked(node, scan):
                key = (id(target), id(state[1]))
                if key not in entered:
                    entered.add(key)
                    stack.extend((s, state) for s in reversed(body_of(target)))
        stack.extend(reversed(children(node, state, scan)))
    return records


def asserting_names(nodes, scan):
    return {
        function.name
        for function in nodes
        if isinstance(function, DEFINITIONS)
        and not is_test_function(function)
        and not is_fixture(function)
        and any(classify(n, scan) in (ASSERT, FAIL) for n in own_nodes(function))
    }


def local_scan(context, helpers):
    scan = Scan(context, helpers)
    scan.local = asserting_names(context.tree.body, scan)
    return scan


def methods_of(owner, scan):
    return asserting_names(owner.body, scan) if owner is not None else set()
