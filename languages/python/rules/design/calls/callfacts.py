import ast

from design.calls.calls import access_resolution, receiver_key, resolve_call
from design.calls.cleanup import enter_facts, exit_facts, paired_exit_facts
from design.calls.exitstack import stack_facts
from design.calls.mutations import mutation_of
from design.support.astutil import CLOSURES, body_nodes, call_line
from design.support.branches import branch_of

TRY_TYPES = tuple(t for t in (ast.Try, getattr(ast, "TryStar", None)) if t is not None)
WITH_TYPES = (ast.With, ast.AsyncWith)


def is_load_attribute(node):
    return isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Load)


def event_kind(node):
    if isinstance(node, ast.Call):
        return "call"
    return "access" if isinstance(node, ast.Attribute) else "exit"


BLOCKED = "blocked"


def called_names(function_node):
    return {
        node.func.id
        for node in body_nodes(function_node)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    }


def call_events(function_node):
    stack = [(statement, False, "visit") for statement in reversed(function_node.body)]
    called = called_names(function_node)
    events = []
    while stack:
        node, in_finally, state = stack.pop()
        if state != "visit":
            kind = state if state == "enter" else event_kind(node)
            events.append((kind, node, in_finally))
        elif not isinstance(node, ast.ClassDef):
            stack.extend(visit_entries(node, in_finally, called))
    return events


def visit_entries(node, in_finally, called):
    marked = isinstance(node, (ast.Call, *WITH_TYPES)) or is_load_attribute(node)
    done = [(node, in_finally, "done")] if marked else []
    return done + child_entries(node, in_finally, called)


def closure_flag(node, in_finally, called):
    if in_finally == BLOCKED:
        return BLOCKED
    runs = isinstance(node, ast.Lambda) or node.name in called
    return False if runs else BLOCKED


def child_entries(node, in_finally, called):
    if isinstance(node, CLOSURES):
        flag = closure_flag(node, in_finally, called)
        children = reversed(list(ast.iter_child_nodes(node)))
        return [(child, flag, "visit") for child in children]
    if not isinstance(node, WITH_TYPES):
        children = flagged_children(node, in_finally)
        return [(child, flag, "visit") for child, flag in reversed(children)]
    body = [(child, in_finally, "visit") for child in reversed(node.body)]
    items = [(item, in_finally, "visit") for item in reversed(node.items)]
    return [*body, (node, in_finally, "enter"), *items]


def flagged_children(node, in_finally):
    if not isinstance(node, TRY_TYPES):
        return [(child, in_finally) for child in ast.iter_child_nodes(node)]
    closing = BLOCKED if in_finally == BLOCKED else True
    plain = node.body + node.handlers + node.orelse
    return [(c, in_finally) for c in plain] + [(c, closing) for c in node.finalbody]


def call_fact(scope, call, cleanup):
    resolution = (
        access_resolution(scope, call)
        if isinstance(call, ast.Attribute)
        else resolve_call(scope, call)
    )
    if resolution is None:
        return None
    line = call.end_lineno if isinstance(call, ast.Attribute) else call_line(call)
    fact = {"target": resolution.target.id, "line": line}
    key = (
        receiver_key(scope, resolution.receiver)
        if resolution.receiver is not None
        else None
    )
    if key is not None:
        fact["receiver"] = key
    if cleanup:
        fact["cleanup"] = True
    if resolution.target.name != "__init__":
        mutation = mutation_of(scope, call, resolution)
        if mutation is not None:
            fact["mutation"] = mutation
    return fact


def node_facts(scope, event):
    kind, node, in_finally = event
    if kind in ("call", "access"):
        fact = call_fact(scope, node, in_finally is True)
        found = [] if fact is None else [fact]
        return found + (stack_facts(scope, node) if kind == "call" else [])
    return enter_facts(scope, node) if kind == "enter" else exit_facts(scope, node)


def event_facts(scope, event):
    branch = list(branch_of(scope.function.node, event[1]))
    facts = node_facts(scope, event)
    return [{**fact, "branch": branch} for fact in facts] if branch else facts


def without_cleanup(facts):
    return [{k: v for k, v in fact.items() if k != "cleanup"} for fact in facts]


def call_facts(scope):
    facts = []
    for event in call_events(scope.function.node):
        found = event_facts(scope, event)
        facts.extend(without_cleanup(found) if event[2] == BLOCKED else found)
    return facts + paired_exit_facts(scope)
