import ast

from checks.common import dotted_name, finding, type_text
from tasks.shields import shielding

RULE = "unshielded-cleanup-await"
BACKENDS = {"trio", "anyio"}
CANCELLED = {"trio.Cancelled"}
CANCELLED_CALL = "anyio.get_cancelled_exc_class"
SAFE_AWAITS = {
    "trio.lowlevel.cancel_shielded_checkpoint",
    "anyio.lowlevel.cancel_shielded_checkpoint",
    "trio.aclose_forcefully",
}
DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)
TRIES = (ast.Try, getattr(ast, "TryStar", ast.Try))


def imports_backend(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            modules = [node.module]
        else:
            continue
        if any(module.split(".")[0] in BACKENDS for module in modules):
            return True
    return False


def is_cancellation_type(node, aliases):
    if isinstance(node, ast.Tuple):
        return any(is_cancellation_type(part, aliases) for part in node.elts)
    if isinstance(node, ast.Call):
        return dotted_name(node.func, aliases) == CANCELLED_CALL
    return dotted_name(node, aliases) in CANCELLED


def callee(node):
    if isinstance(node, ast.Call):
        return f"{type_text(node.func)}()"
    return type_text(node) if isinstance(node, (ast.Name, ast.Attribute)) else "value"


def checkpoint(node, aliases):
    if isinstance(node, ast.Await):
        value = node.value
        called = dotted_name(value.func, aliases) if isinstance(value, ast.Call) else None
        return None if called in SAFE_AWAITS else f"await {callee(value)}"
    if isinstance(node, ast.AsyncWith):
        return f"async with {callee(node.items[0].context_expr)}"
    if isinstance(node, ast.AsyncFor):
        return f"async for {callee(node.iter)}"
    return None


def checkpoints(statements, aliases):
    pending = list(reversed(statements))
    while pending:
        node = pending.pop()
        if isinstance(node, DEFINITIONS) or shielding(node, aliases):
            continue
        found = checkpoint(node, aliases)
        if found:
            yield node, found
        pending.extend(reversed(list(ast.iter_child_nodes(node))))


class Cleanup:
    def __init__(self, context):
        self.context = context
        self.aliases = context.aliases
        self.reported = set()
        self.findings = []

    def shielded_around(self, node):
        current = self.context.parents.get(id(node))
        while current is not None and not isinstance(current, DEFINITIONS):
            if shielding(current, self.aliases):
                return True
            current = self.context.parents.get(id(current))
        return False

    def region(self, label, statements, owner):
        if self.shielded_around(owner):
            return
        for node, text in checkpoints(statements, self.aliases):
            if id(node) in self.reported:
                continue
            self.reported.add(id(node))
            self.findings.append(
                finding(self.context.path, RULE, f"{text} in {label}", node)
            )
            return

    def visit(self, node):
        self.region("finally", node.finalbody, node)
        for handler in node.handlers:
            if is_cancellation_type(handler.type, self.aliases):
                label = f"except {type_text(handler.type)}"
                self.region(label, handler.body, node)


def check(context):
    if not imports_backend(context.tree):
        return []
    cleanup = Cleanup(context)
    for node in ast.walk(context.tree):
        if isinstance(node, TRIES):
            cleanup.visit(node)
    return cleanup.findings
