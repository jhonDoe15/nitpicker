import ast

from checks.common import dotted_name, finding, own_nodes
from tasks.bindings import SCOPES, Bindings, canonical
from tasks.shields import shielding

RULE = "unshielded-cleanup-await"
CANCELLED = {"trio.Cancelled"}
CANCELLED_CALL = "anyio.get_cancelled_exc_class"
SAFE_AWAITS = {
    "trio.lowlevel.cancel_shielded_checkpoint",
    "anyio.lowlevel.cancel_shielded_checkpoint",
    "trio.aclose_forcefully",
}
EVIDENCE = {
    "trio.run",
    "trio.open_nursery",
    "trio.CancelScope",
    "trio.move_on_after",
    "trio.move_on_at",
    "trio.fail_after",
    "trio.fail_at",
    "trio.Cancelled",
    "anyio.run",
    "anyio.create_task_group",
    "anyio.CancelScope",
    "anyio.move_on_after",
    "anyio.fail_after",
    "anyio.get_cancelled_exc_class",
}
TRIES = (ast.Try, getattr(ast, "TryStar", ast.Try))


def imports_trio(node):
    if isinstance(node, ast.Import):
        return any(alias.name.split(".")[0] == "trio" for alias in node.names)
    return (
        isinstance(node, ast.ImportFrom)
        and node.level == 0
        and (node.module or "").split(".")[0] == "trio"
    )


def has_cancellation_semantics(context):
    aliases = context.aliases
    for node in ast.walk(context.tree):
        if imports_trio(node):
            return True
        if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            if any(f"{node.module}.{a.name}" in EVIDENCE for a in node.names):
                return True
        elif isinstance(node, (ast.Name, ast.Attribute)):
            if dotted_name(node, aliases) in EVIDENCE:
                return True
    return False


def callee(node, aliases):
    if isinstance(node, ast.Call):
        return f"{canonical(node.func, aliases)}()"
    if isinstance(node, (ast.Name, ast.Attribute)):
        return canonical(node, aliases)
    return "value"


def checkpoint(node, aliases):
    if isinstance(node, ast.Await):
        value = node.value
        called = (
            dotted_name(value.func, aliases) if isinstance(value, ast.Call) else None
        )
        if called in SAFE_AWAITS:
            return None
        return node, f"await {callee(value, aliases)}"
    if isinstance(node, ast.AsyncWith):
        return node, f"async with {callee(node.items[0].context_expr, aliases)}"
    if isinstance(node, ast.AsyncFor):
        return node, f"async for {callee(node.iter, aliases)}"
    if isinstance(node, ast.comprehension) and node.is_async:
        return node.iter, f"async for {callee(node.iter, aliases)}"
    return None


class Cleanup:
    def __init__(self, context):
        self.context = context
        self.aliases = context.aliases
        self.bindings = Bindings(context)
        self.reported = set()
        self.findings = []

    def shielded(self, node):
        current = node
        while current is not None and not isinstance(current, SCOPES):
            if shielding(current, self.aliases, self.bindings):
                return True
            current = self.context.parents.get(id(current))
        return False

    def first_checkpoint(self, statements):
        found = []
        for statement in statements:
            if isinstance(statement, SCOPES):
                continue
            for node in [statement, *own_nodes(statement)]:
                hit = checkpoint(node, self.aliases)
                if hit and not self.shielded(node) and id(hit[0]) not in self.reported:
                    found.append(hit)
        return min(
            found, key=lambda hit: (hit[0].lineno, hit[0].col_offset), default=None
        )

    def region(self, label, statements, owner):
        first = self.first_checkpoint(statements)
        if first is None:
            return
        node, text = first
        self.reported.add(id(node))
        function = self.bindings.function_name(owner)
        where = f"{label} of {function}" if function else label
        self.findings.append(
            finding(self.context.path, RULE, f"{text} in {where}", node)
        )

    def is_cancellation(self, node):
        node = self.bindings.resolve(node, node)
        if isinstance(node, ast.Tuple):
            return any(self.is_cancellation(part) for part in node.elts)
        if isinstance(node, ast.Call):
            return dotted_name(node.func, self.aliases) == CANCELLED_CALL
        return dotted_name(node, self.aliases) in CANCELLED

    def visit(self, node):
        self.region("finally", node.finalbody, node)
        for handler in node.handlers:
            if handler.type is not None and self.is_cancellation(handler.type):
                caught = canonical(
                    self.bindings.resolve(handler.type, handler), self.aliases
                )
                self.region(f"except {caught}", handler.body, node)


def check(context):
    if not has_cancellation_semantics(context):
        return []
    cleanup = Cleanup(context)
    for node in ast.walk(context.tree):
        if isinstance(node, TRIES):
            cleanup.visit(node)
    return cleanup.findings
