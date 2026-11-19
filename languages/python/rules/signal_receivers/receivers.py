import ast
from collections import namedtuple

from checks.common import last_name, walk_statements

Receiver = namedtuple("Receiver", "context function signals sender")
SAVE_SIGNALS = {"post_save", "pre_save"}
DELETE_SIGNALS = {"post_delete", "pre_delete", "m2m_changed"}
SIGNALS = SAVE_SIGNALS | DELETE_SIGNALS
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def signal_names(node):
    items = node.elts if isinstance(node, (ast.List, ast.Tuple)) else [node]
    return {name for name in map(last_name, items) if name in SIGNALS}


def sender_name(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value.rsplit(".", 1)[-1]
    return last_name(node) if node is not None else None


def keyword_value(call, name):
    return next((k.value for k in call.keywords if k.arg == name), None)


def decorated_receivers(context, function):
    for decorator in function.decorator_list:
        if not isinstance(decorator, ast.Call) or not decorator.args:
            continue
        if last_name(decorator.func) != "receiver":
            continue
        signals = signal_names(decorator.args[0])
        if signals:
            sender = sender_name(keyword_value(decorator, "sender"))
            yield Receiver(context, function, signals, sender)


def connected_receivers(context, functions):
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if node.func.attr != "connect":
            continue
        signals = signal_names(node.func.value) if node.args else set()
        target = functions.get(getattr(node.args[0], "id", None)) if signals else None
        if target is not None:
            sender = sender_name(keyword_value(node, "sender"))
            yield Receiver(context, target, signals, sender)


def context_receivers(context):
    functions = {}
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, FUNCTIONS):
            functions.setdefault(node.name, node)
            found.extend(decorated_receivers(context, node))
    found.extend(connected_receivers(context, functions))
    return found


def project_receivers(project):
    def build(_):
        return [
            receiver
            for context in project.contexts.values()
            if not context.tests
            for receiver in context_receivers(context)
        ]

    return project.memo("signal-receivers", build)


def function_calls(function):
    return [n for n in walk_statements(function.body) if isinstance(n, ast.Call)]
