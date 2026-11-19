import ast

from checks.common import LOG_METHODS
from null_branches.targets import EXIT_CALLS, is_store, nodes_within, target_key

LEAVING = (ast.Return, ast.Raise, ast.Break, ast.Continue)
LEAVING_NAMES = {"fail", "abort", "die", "panic", "unreachable", "assert_never"}
WRITERS = {"append", "extend", "write", "writelines", "add", "put", "send", "emit"}


def is_noop(statement):
    if isinstance(statement, ast.Pass):
        return True
    return isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Constant)


def does_something(body):
    return any(not is_noop(statement) for statement in body)


def called_name(call):
    func = call.func
    if isinstance(func, ast.Name):
        return func.id
    return func.attr if isinstance(func, ast.Attribute) else None


def is_exit(node, raisers):
    if not isinstance(node, ast.Call):
        return False
    name = called_name(node)
    return ast.unparse(node.func) in EXIT_CALLS or name in LEAVING_NAMES | raisers


def is_placeholder_call(call):
    name = called_name(call)
    if name == "print" or name in LOG_METHODS:
        return True
    plain = all(isinstance(argument, ast.Constant) for argument in call.args)
    return name in WRITERS and bool(call.args) and plain


def rebinds(node, key):
    return target_key(node) == key and is_store(node)


def leaves(nodes, key, raisers):
    return any(
        isinstance(node, LEAVING) or is_exit(node, raisers) or rebinds(node, key)
        for node in nodes
    )


def mentions(node, key):
    return any(target_key(inner) == key for inner in nodes_within(node))


def stand_in_callees(nodes, key):
    return {
        ast.unparse(node.func)
        for node in nodes
        if isinstance(node, ast.Call)
        and not any(mentions(argument, key) for argument in node.args)
    }


def initialises(nodes):
    return any(
        isinstance(node, ast.Call) and not is_placeholder_call(node) for node in nodes
    )


def branch_facts(body, key, raisers):
    nodes = [inner for statement in body for inner in nodes_within(statement)]
    return {
        "acts": does_something(body),
        "leaves": leaves(nodes, key, raisers),
        "initialises": initialises(nodes),
        "callees": stand_in_callees(nodes, key),
    }
