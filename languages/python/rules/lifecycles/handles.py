import ast

from checks.common import dotted_name, finding
from lifecycles.scopes import (
    FUNCTIONS,
    class_closers,
    methods_of,
    reachable_methods,
    attribute_aliases,
    self_attribute,
)

RULE = "handle-unreleased-on-close"
SCHEDULERS = {"call_later", "call_at", "call_repeatedly"}
SIGNAL_HANDLERS = {"add_signal_handler"}
SIGNAL_CALLS = {"signal.signal"}
TIMER_CALLS = {"threading.Timer", "Timer"}
CANCEL_METHODS = {"cancel", "stop"}


def method_name(call):
    func = call.func
    return func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")


def registrations(method, aliases):
    for node in ast.walk(method):
        if not isinstance(node, ast.Call):
            continue
        name = method_name(node)
        dotted = dotted_name(node.func, aliases) or ""
        if name in SCHEDULERS and isinstance(node.func, ast.Attribute):
            yield node, "handle", name
        elif name in SIGNAL_HANDLERS:
            yield node, "signal", name
        elif dotted in SIGNAL_CALLS:
            yield node, "restore", "signal.signal"
        elif dotted in TIMER_CALLS or dotted.endswith(".Timer"):
            yield node, "handle", "Timer"


def assigned_names(method, call):
    for node in ast.walk(method):
        if isinstance(node, (ast.Assign, ast.AnnAssign)) and node.value is call:
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            yield from targets


def stored_in(method, name, call):
    for node in ast.walk(method):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            holds = any(
                (isinstance(arg, ast.Name) and arg.id == name) or arg is call
                for arg in node.args
            )
            if holds and node.func.attr in {"append", "add", "extend"}:
                yield self_attribute(node.func.value)


def handle_owners(method, call):
    owners, local = set(), set()
    for target in assigned_names(method, call):
        if self_attribute(target) is not None:
            owners.add(self_attribute(target))
        elif isinstance(target, ast.Name):
            local.add(target.id)
            owners.update(stored_in(method, target.id, call))
    owners.update(stored_in(method, None, call))
    return owners - {None}, local


def cancels_locally(method, names):
    for node in ast.walk(method):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            owner = node.func.value
            named = isinstance(owner, ast.Name) and owner.id in names
            if named and node.func.attr in CANCEL_METHODS | {"join"}:
                return True
    return False


def cancelled_by_call(call, aliases):
    if isinstance(call.func, ast.Attribute) and call.func.attr in CANCEL_METHODS:
        owner = call.func.value
        if isinstance(owner, ast.Name):
            return aliases.get(owner.id)
        return self_attribute(owner)
    return None


def loop_cancelled(method, aliases):
    for node in ast.walk(method):
        if isinstance(node, ast.For):
            source = self_attribute(node.iter)
            if source is None and isinstance(node.iter, ast.Name):
                source = aliases.get(node.iter.id)
            if source is not None and any(
                isinstance(n, ast.Call) and method_name(n) in CANCEL_METHODS
                for n in ast.walk(node)
            ):
                yield source


def passed_attributes(method):
    for node in ast.walk(method):
        if isinstance(node, ast.Call) and method_name(node) not in CANCEL_METHODS:
            for arg in node.args:
                if self_attribute(arg) is not None:
                    yield self_attribute(arg)


def releases(methods):
    cancelled, removed, restored = set(), False, False
    for method in methods:
        aliases = attribute_aliases(method)
        cancelled.update(loop_cancelled(method, aliases))
        cancelled.update(passed_attributes(method))
        for call in (n for n in ast.walk(method) if isinstance(n, ast.Call)):
            attribute = cancelled_by_call(call, aliases)
            if attribute is not None:
                cancelled.add(attribute)
            name = method_name(call)
            removed = removed or name == "remove_signal_handler"
            restored = restored or (name == "signal" and bool(call.args))
    return cancelled, removed, restored


def is_released(method, call, kind, state):
    cancelled, removed, restored = state
    if kind == "signal":
        return removed
    if kind == "restore":
        return restored
    owners, local = handle_owners(method, call)
    return bool(owners & cancelled) or cancels_locally(method, local)


def check(context):
    found = []
    classes = (node for node in ast.walk(context.tree) if isinstance(node, ast.ClassDef))
    for cls in classes:
        closers = class_closers(cls)
        if not closers:
            continue
        reached = [m for closer in closers for m in reachable_methods(cls, closer)]
        state = releases(reached)
        for method in methods_of(cls):
            if method in reached:
                continue
            for call, kind, label in registrations(method, context.aliases):
                if not is_released(method, call, kind, state):
                    subject = f"{cls.name}.{method.name}: {label}"
                    found.append(finding(context.path, RULE, subject, call))
    return found
