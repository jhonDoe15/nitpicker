import ast
from collections import namedtuple

from checks.common import root_name
from leaks.shared_state import global_names, local_names

UNDO_CALLS = {
    "remove": {"add", "append", "insert", "register", "add_callback"},
    "discard": {"add"},
    "unregister": {"register"},
    "deregister": {"register"},
    "removeHandler": {"addHandler"},
    "remove_handler": {"add_handler"},
    "unsubscribe": {"subscribe"},
    "disconnect": {"connect"},
}
CLOSE_CALLS = {"close", "aclose", "release"}

Scope = namedtuple("Scope", "globals locals plain")
Earlier = namedtuple("Earlier", "assigned valued named calls")


def expression_call(statement):
    if not isinstance(statement, ast.Expr):
        return None
    value = statement.value
    if isinstance(value, ast.Await):
        value = value.value
    return value if isinstance(value, ast.Call) else None


def method_call(statement):
    call = expression_call(statement)
    if call is not None and isinstance(call.func, ast.Attribute):
        return call
    return None


def argument_text(call):
    return tuple(ast.unparse(argument) for argument in call.args)


def scope_of(function, plain):
    return Scope(global_names(function), local_names(function), plain)


def new_index():
    return Earlier({}, {}, {}, {})


def forget_rebound(earlier, item):
    if isinstance(item, ast.Assign):
        targets = item.targets
    else:
        targets = [item.target] if isinstance(item, ast.AugAssign) else []
    names = {target.id for target in targets if isinstance(target, ast.Name)}
    for key, saved in list(earlier.valued.items()):
        target = saved.targets[0] if len(saved.targets) == 1 else None
        if isinstance(target, ast.Name) and target.id in names:
            del earlier.valued[key]


def add_statement(earlier, item):
    forget_rebound(earlier, item)
    if isinstance(item, ast.Assign):
        for target in item.targets:
            earlier.assigned.setdefault(ast.unparse(target), item)
        earlier.valued.setdefault(ast.unparse(item.value), item)
        if len(item.targets) == 1 and isinstance(item.targets[0], ast.Name):
            earlier.named.setdefault(item.targets[0].id, item)
    call = method_call(item)
    if call is not None:
        key = (ast.unparse(call.func.value), argument_text(call))
        earlier.calls.setdefault(key, []).append((call.func.attr, item))


def index_of(statements):
    earlier = new_index()
    for item in statements:
        add_statement(earlier, item)
    return earlier


def inner_call(item):
    value = item.value
    return value.value if isinstance(value, ast.Await) else value


def token_reset(statement, earlier):
    call = method_call(statement)
    if call is None or call.func.attr != "reset" or len(call.args) != 1:
        return None
    token = call.args[0]
    item = earlier.named.get(token.id) if isinstance(token, ast.Name) else None
    value = item.value if item is not None else None
    if (
        isinstance(value, ast.Call)
        and isinstance(value.func, ast.Attribute)
        and value.func.attr == "set"
    ):
        return item, f"{ast.unparse(value.func)}() before {ast.unparse(call.func)}()"
    return None


def is_local_receiver(node, scope):
    return root_name(node) in scope.locals and root_name(node) != "self"


def registered_pair(statement, earlier, scope):
    call = method_call(statement)
    wanted = UNDO_CALLS.get(call.func.attr) if call is not None else None
    if not wanted or (scope.plain and is_local_receiver(call.func.value, scope)):
        return None
    key = (ast.unparse(call.func.value), argument_text(call))
    for attr, item in earlier.calls.get(key, []):
        if attr in wanted:
            first = method_call(item)
            return (
                item,
                f"{ast.unparse(first.func)}() before {ast.unparse(call.func)}()",
            )
    return None


def opened_pair(statement, earlier, scope):
    call = method_call(statement)
    if scope.plain or call is None or call.func.attr not in CLOSE_CALLS:
        return None
    owner = call.func.value
    item = earlier.named.get(owner.id) if isinstance(owner, ast.Name) else None
    if item is not None and isinstance(inner_call(item), ast.Call):
        opener = inner_call(item)
        return item, f"{ast.unparse(opener.func)}() before {ast.unparse(call.func)}()"
    return None


def shared_target(node, scope):
    if isinstance(node, ast.Name):
        return node.id in scope.globals
    if not isinstance(node, (ast.Attribute, ast.Subscript)):
        return False
    return not (scope.plain and is_local_receiver(node, scope))


def saved_assignment(statement, earlier, text):
    item = earlier.valued.get(text)
    if item is None or len(item.targets) != 1:
        return None
    saved = item.targets[0]
    same = isinstance(saved, ast.Name) and ast.unparse(statement.value) == saved.id
    return item if same else None


def restored_assignment(statement, earlier, scope):
    if not isinstance(statement, ast.Assign) or len(statement.targets) != 1:
        return None
    target = statement.targets[0]
    if not shared_target(target, scope):
        return None
    text = ast.unparse(target)
    item = saved_assignment(statement, earlier, text)
    if item is None and not scope.plain:
        item = earlier.assigned.get(text)
    if item is None:
        return None
    return item, f"{text} set before and again after"


def undo_match(statement, earlier, scope):
    return (
        token_reset(statement, earlier)
        or registered_pair(statement, earlier, scope)
        or opened_pair(statement, earlier, scope)
        or restored_assignment(statement, earlier, scope)
    )
