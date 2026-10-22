import ast

from design.astutil import SCOPES, call_line
from design.calls import access_resolution, receiver_key, resolve_call
from design.cleanup import enter_facts, exit_facts, paired_exit_facts
from design.mutations import mutation_of

TRY_TYPES = tuple(t for t in (ast.Try, getattr(ast, "TryStar", None)) if t is not None)
WITH_TYPES = (ast.With, ast.AsyncWith)


def is_load_attribute(node):
    return isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Load)


def event_kind(node):
    if isinstance(node, ast.Call):
        return "call"
    return "access" if isinstance(node, ast.Attribute) else "exit"


def call_events(function_node):
    stack = [(statement, False, "visit") for statement in reversed(function_node.body)]
    events = []
    while stack:
        node, in_finally, state = stack.pop()
        if state != "visit":
            events.append(
                (state if state == "enter" else event_kind(node), node, in_finally)
            )
            continue
        if isinstance(node, SCOPES):
            continue
        if isinstance(node, (ast.Call, *WITH_TYPES)) or is_load_attribute(node):
            stack.append((node, in_finally, "done"))
        stack.extend(child_entries(node, in_finally))
    return events


def child_entries(node, in_finally):
    if not isinstance(node, WITH_TYPES):
        children = flagged_children(node, in_finally)
        return [(child, flag, "visit") for child, flag in reversed(children)]
    body = [(child, in_finally, "visit") for child in reversed(node.body)]
    items = [(item, in_finally, "visit") for item in reversed(node.items)]
    return [*body, (node, in_finally, "enter"), *items]


def flagged_children(node, in_finally):
    if isinstance(node, TRY_TYPES):
        plain = node.body + [h for h in node.handlers] + node.orelse
        return [(c, in_finally) for c in plain] + [(c, True) for c in node.finalbody]
    return [(child, in_finally) for child in ast.iter_child_nodes(node)]


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


def call_facts(scope):
    facts = []
    for kind, node, in_finally in call_events(scope.function.node):
        if kind in ("call", "access"):
            fact = call_fact(scope, node, in_finally)
            if fact is not None:
                facts.append(fact)
        elif kind == "enter":
            facts.extend(enter_facts(scope, node))
        else:
            facts.extend(exit_facts(scope, node))
    return facts + paired_exit_facts(scope)
