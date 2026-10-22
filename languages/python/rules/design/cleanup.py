import ast

from checks.common import dotted_name
from design.astutil import body_without_docstring
from design.calls import receiver_key, resolve_call
from design.evaluate import enter_returns_self as returns_self
from design.evaluate import type_of
from design.lookup import find_member
from design.symbols import Klass

CLOSING = {"contextlib.closing"}
ENTER_EXIT = {"__enter__": "__exit__", "__aenter__": "__aexit__"}
MAX_DEPTH = 3


def member_function(index, klass, name):
    if not isinstance(klass, Klass):
        return None
    found = find_member(index, klass, name)
    return found[0] if found else None


def enter_returns_self(scope, klass, asynchronous):
    enter = member_function(
        scope.index, klass, "__aenter__" if asynchronous else "__enter__"
    )
    return enter is not None and returns_self(enter)


def unconditional_calls(function):
    scope_calls = []
    for statement in body_without_docstring(function.node.body):
        value = (
            getattr(statement, "value", None)
            if isinstance(statement, (ast.Expr, ast.Return))
            else None
        )
        value = value.value if isinstance(value, ast.Await) else value
        if isinstance(value, ast.Call):
            scope_calls.append(value)
    return scope_calls


def implied_targets(scope, exit_function):
    found = []
    pending = [(exit_function, 0)]
    for function, depth in pending:
        inner = scope.index.scope_of(function)
        if depth >= MAX_DEPTH or inner.self_name is None:
            continue
        for call in unconditional_calls(function):
            resolution = resolve_call(inner, call)
            on_self = (
                resolution is not None
                and isinstance(resolution.receiver, ast.Name)
                and resolution.receiver.id == inner.self_name
            )
            if on_self and resolution.target not in found:
                found.append(resolution.target)
                pending.append((resolution.target, depth + 1))
    return found


def exit_receivers(scope, item, klass, asynchronous):
    keys = []
    key = receiver_key(scope, item.context_expr)
    if key is not None:
        keys.append(key)
    alias = item.optional_vars
    if isinstance(alias, ast.Name) and scope.is_single(alias.id):
        if enter_returns_self(scope, klass, asynchronous) and alias.id not in keys:
            keys.append(alias.id)
    return keys


def closing_target(scope, expression):
    if not isinstance(expression, ast.Call) or len(expression.args) != 1:
        return None
    if dotted_name(expression.func, scope.module.aliases) not in CLOSING:
        return None
    klass = type_of(scope, expression.args[0])
    function = member_function(scope.index, klass, "close")
    key = receiver_key(scope, expression.args[0])
    return (function, key) if function is not None and key is not None else None


def item_facts(scope, item, node):
    asynchronous = isinstance(node, ast.AsyncWith)
    closing = closing_target(scope, item.context_expr)
    if closing is not None:
        return [fact(closing[0], closing[1], node.lineno)]
    klass = type_of(scope, item.context_expr)
    exit_function = member_function(
        scope.index, klass, "__aexit__" if asynchronous else "__exit__"
    )
    if exit_function is None:
        return []
    targets = implied_targets(scope, exit_function)
    keys = exit_receivers(scope, item, klass, asynchronous)
    return [fact(target, key, node.lineno) for key in keys for target in targets]


def fact(target, key, line, cleanup=True):
    found = {"target": target.id, "line": line, "receiver": key}
    if cleanup:
        found["cleanup"] = True
    return found


def item_enter_facts(scope, item, node):
    asynchronous = isinstance(node, ast.AsyncWith)
    if closing_target(scope, item.context_expr) is not None:
        return []
    klass = type_of(scope, item.context_expr)
    enter_function = member_function(
        scope.index, klass, "__aenter__" if asynchronous else "__enter__"
    )
    if enter_function is None:
        return []
    targets = implied_targets(scope, enter_function)
    keys = exit_receivers(scope, item, klass, asynchronous)
    return [fact(target, key, node.lineno, False) for key in keys for target in targets]


def enter_facts(scope, node):
    return [f for item in node.items for f in item_enter_facts(scope, item, node)]


def exit_facts(scope, node):
    return [f for item in node.items for f in item_facts(scope, item, node)]


def paired_exit_facts(scope):
    function = scope.function
    exit_name = ENTER_EXIT.get(function.name)
    if exit_name is None or scope.self_name is None:
        return []
    exit_function = member_function(scope.index, function.owner, exit_name)
    if exit_function is None:
        return []
    targets = implied_targets(scope, exit_function)
    return [fact(target, "self", function.node.end_lineno) for target in targets]
