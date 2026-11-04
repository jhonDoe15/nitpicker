import ast

from checks.common import dotted_name, finding
from tasks.bindings import DEFINITIONS, SCOPES, Bindings
from tasks.handed import coroutine_handed, free_names, spawn_handed

RULE = "task-outlives-resource"
GROUPS = {
    "trio.open_nursery",
    "anyio.create_task_group",
    "asyncio.TaskGroup",
    "asyncio.taskgroups.TaskGroup",
}
NOT_RESOURCES = GROUPS | {
    "trio.CancelScope",
    "trio.move_on_after",
    "trio.move_on_at",
    "trio.fail_after",
    "trio.fail_at",
    "anyio.CancelScope",
    "anyio.move_on_after",
    "anyio.fail_after",
    "asyncio.timeout",
    "asyncio.timeout_at",
    "contextlib.suppress",
}
SPAWNERS = {"start_soon", "start", "create_task"}
BARE_TASKS = {"asyncio.create_task", "asyncio.ensure_future"}
WITHS = (ast.With, ast.AsyncWith)


class Entry:
    def __init__(self, kind, name, block):
        self.kind = kind
        self.name = name
        self.block = block


def entries_of(node, aliases, bindings):
    found = []
    for item in node.items:
        expression, target = item.context_expr, item.optional_vars
        value = bindings.resolve(expression, node)
        called = (
            dotted_name(value.func, aliases) if isinstance(value, ast.Call) else None
        )
        if called in GROUPS:
            names = [expression, target]
            found.extend(
                Entry("group", name.id, node)
                for name in names
                if isinstance(name, ast.Name)
            )
        elif called in NOT_RESOURCES:
            continue
        elif isinstance(target, ast.Name):
            found.append(Entry("resource", target.id, node))
        elif target is None and isinstance(expression, ast.Name):
            found.append(Entry("bound", expression.id, node))
    return found


def blocks_of(statement):
    for field in ("body", "orelse", "finalbody"):
        value = getattr(statement, field, None)
        if isinstance(value, list):
            yield value
    for part in getattr(statement, "handlers", []) + getattr(statement, "cases", []):
        yield part.body


def calls_in(statement):
    for child in ast.iter_child_nodes(statement):
        if not isinstance(child, (ast.stmt, ast.ExceptHandler, ast.match_case)):
            yield from (n for n in ast.walk(child) if isinstance(n, ast.Call))


class Lifetimes:
    def __init__(self, context):
        self.context = context
        self.aliases = context.aliases
        self.bindings = Bindings(context)
        self.findings = []

    def scan(self, statements, stack, closures):
        pending = [(iter(statements), stack)]
        while pending:
            items, current = pending[-1]
            statement = next(items, None)
            if statement is None:
                pending.pop()
            elif isinstance(statement, DEFINITIONS):
                resources = {e.name for e in current if e.kind != "group"}
                closures[statement.name] = free_names(statement) & resources
            elif isinstance(statement, WITHS):
                inner = current + entries_of(statement, self.aliases, self.bindings)
                pending.append((iter(statement.body), inner))
            elif not isinstance(statement, SCOPES):
                self.statement(statement, current, closures)
                blocks = list(blocks_of(statement))
                pending.extend((iter(block), current) for block in reversed(blocks))

    def statement(self, statement, stack, closures):
        for call in calls_in(statement):
            self.group_spawn(call, statement, stack, closures)
        self.bare_task(statement, stack)

    def group_spawn(self, call, statement, stack, closures):
        func = call.func
        if not (isinstance(func, ast.Attribute) and func.attr in SPAWNERS):
            return
        groups = [
            i
            for i, e in enumerate(stack)
            if e.kind == "group"
            and isinstance(func.value, ast.Name)
            and e.name == func.value.id
        ]
        if not groups:
            return
        inside = [e for e in stack[groups[-1] + 1 :] if e.kind == "resource"]
        handed = spawn_handed(call, closures, self.aliases)
        owners = [e for e in reversed(inside) if e.name in handed]
        held, task = task_call(statement)
        if owners and not (
            held is call and task and used_after(task, owners[0].block, call)
        ):
            self.report(call, owners[0].name, func.attr)

    def report(self, call, resource, method):
        function = self.bindings.function_name(call)
        where = f" in {function}" if function else ""
        subject = f"{resource} passed to {method}{where}"
        self.findings.append(finding(self.context.path, RULE, subject, call))

    def bare_task(self, statement, stack):
        call, task = task_call(statement)
        if call is None or dotted_name(call.func, self.aliases) not in BARE_TASKS:
            return
        handed = coroutine_handed(call.args[0]) if call.args else set()
        owners = [e for e in reversed(stack) if e.kind != "group" and e.name in handed]
        if owners and not (task and used_after(task, owners[0].block, call)):
            self.report(call, owners[0].name, dotted_name(call.func, self.aliases))


def task_call(statement):
    if isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call):
        return statement.value, None
    if (
        isinstance(statement, ast.Assign)
        and isinstance(statement.value, ast.Call)
        and len(statement.targets) == 1
        and isinstance(statement.targets[0], ast.Name)
    ):
        return statement.value, statement.targets[0].id
    return None, None


def used_after(task, block, call):
    return any(
        isinstance(part, ast.Name)
        and isinstance(part.ctx, ast.Load)
        and part.id == task
        and part.lineno > call.lineno
        for statement in block.body
        for part in ast.walk(statement)
    )


def check(context):
    lifetimes = Lifetimes(context)
    scopes = [context.tree] + [
        node for node in ast.walk(context.tree) if isinstance(node, DEFINITIONS)
    ]
    for scope in scopes:
        lifetimes.scan(scope.body, [], {})
    return lifetimes.findings
