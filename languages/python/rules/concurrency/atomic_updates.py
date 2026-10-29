import ast

from checks.common import finding, functions_of, own_nodes
from concurrency.evaluation import events_of, same_path, suspends
from concurrency.lock_keys import LockKeys
from concurrency.shared import Scope, stored_names
from concurrency.statements import (
    Saved,
    blocks_of,
    forget_overwritten,
    header_names,
    headers_of,
    is_compound,
    mark_awaited,
    merge,
    paired,
    reads_through,
    released,
    without,
    written_targets,
)

RULE = "atomic-update-across-await"
DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
LOOPS = (ast.For, ast.AsyncFor, ast.While)
TRIES = tuple(getattr(ast, name) for name in ("Try", "TryStar") if hasattr(ast, name))
WAITS = {"wait", "wait_for"}


def stale_inside(statement, target):
    events = events_of(statement.value)
    if isinstance(statement, ast.AugAssign):
        return any(event.kind == "await" for event in events)
    for position, event in enumerate(events):
        if event.kind == "read" and reads_through(event.text, target):
            later = events[position + 1 :]
            if any(e.kind == "await" and same_path(event, e) for e in later):
                return True
    return False


def local_root(text):
    return text.split(".")[0].split("[")[0]


def stale_through_local(statement, target, saved, locks):
    events = events_of(statement.value)
    for position, event in enumerate(events):
        parts = saved.get(local_root(event.text), ()) if event.kind == "read" else ()
        later = events[position + 1 :]
        for part in parts:
            if part.locks & locks:
                continue
            if not any(reads_through(place, target) for place in part.locations):
                continue
            if part.awaited or any(e.kind == "await" for e in later):
                return True
    return False


def assigned_pairs(statement):
    if isinstance(statement, ast.Assign):
        pairs = [
            pair
            for target in statement.targets
            for pair in paired(target, statement.value)
        ]
    elif isinstance(statement, ast.AnnAssign) and statement.value is not None:
        pairs = [(statement.target, statement.value)]
    else:
        pairs = []
    pairs.extend(walrus_pairs(statement))
    return [(t.id, value) for t, value in pairs if isinstance(t, ast.Name)]


def walrus_pairs(node):
    return [
        (item.target, item.value)
        for item in [node, *own_nodes(node)]
        if isinstance(item, ast.NamedExpr)
    ]


def consumed_by_suspension(value):
    roots = [
        node.value if isinstance(node, ast.Await) else node.iter
        for node in [value, *own_nodes(value)]
        if isinstance(node, ast.Await)
        or (isinstance(node, ast.comprehension) and node.is_async)
    ]
    return {id(node) for root in roots for node in ast.walk(root)}


def wait_owner(node):
    call = node.value if isinstance(node, ast.Await) else None
    if not isinstance(call, ast.Call) or not isinstance(call.func, ast.Attribute):
        return None
    return ast.unparse(call.func.value) if call.func.attr in WAITS else None


class Walker:
    def __init__(self, context, function, scope, keys):
        self.context = context
        self.function = function
        self.scope = scope
        self.keys = keys
        self.found = {}

    def report(self, statement, target):
        text = ast.unparse(target)
        subject = f"{text} in {self.function.name}"
        key = (id(statement), text)
        if key not in self.found:
            self.found[key] = finding(self.context.path, RULE, subject, statement)

    def parts_of(self, value, saved, locks, suspended):
        events = events_of(value)
        consumed = consumed_by_suspension(value)
        shared = [
            index
            for index, event in enumerate(events)
            if event.kind == "read"
            and id(event.node) not in consumed
            and self.scope.is_shared_location(event.node)
        ]
        parts = []
        if shared:
            awaited = any(event.kind == "await" for event in events[shared[0] :])
            places = frozenset(events[index].text for index in shared)
            parts.append(Saved(places, locks, awaited))
        for event in events:
            for part in saved.get(local_root(event.text or ""), ()):
                parts.append(part._replace(awaited=part.awaited or suspended))
        return tuple(dict.fromkeys(parts))

    def remembered(self, statement, saved, locks):
        suspended = suspends(statement)
        found = {}
        target = getattr(statement, "target", None)
        if isinstance(statement, ast.AugAssign) and isinstance(target, ast.Name):
            own = saved.get(target.id, ())
            found[target.id] = tuple(
                part._replace(awaited=part.awaited or suspended) for part in own
            ) + self.parts_of(statement.value, saved, locks, suspended)
        for name, value in assigned_pairs(statement):
            found[name] = found.get(name, ()) + self.parts_of(
                value, saved, locks, suspended
            )
        return {name: parts for name, parts in found.items() if parts}

    def check_write(self, statement, saved, locks):
        for target in written_targets(statement):
            if not self.scope.is_shared_location(target):
                continue
            if not locks and stale_inside(statement, target):
                self.report(statement, target)
            elif stale_through_local(statement, target, saved, locks):
                self.report(statement, target)

    def releases(self, node, held):
        texts = {text: lock for lock, text in held}
        owners = (wait_owner(item) for item in [node, *own_nodes(node)])
        return frozenset(texts[owner] for owner in owners if owner in texts)

    def scan(self, statements, saved, held):
        for statement in statements:
            if isinstance(statement, DEFINITIONS):
                continue
            if is_compound(statement):
                saved = self.scan_compound(statement, saved, held)
            else:
                saved = self.scan_simple(statement, saved, held)
        return saved

    def scan_simple(self, statement, saved, held):
        releasing = self.releases(statement, held)
        locks = frozenset(lock for lock, _ in held) - releasing
        self.check_write(statement, saved, locks)
        fresh = self.remembered(statement, saved, locks)
        saved = forget_overwritten(statement, saved)
        saved = released(without(saved, stored_names(statement)), releasing)
        if suspends(statement):
            saved = mark_awaited(saved)
        return {**saved, **fresh}

    def scan_compound(self, statement, saved, held):
        locks = frozenset(lock for lock, _ in held)
        fresh = {}
        for header in headers_of(statement):
            for target, value in walrus_pairs(header):
                fresh[target.id] = self.parts_of(value, saved, locks, suspends(header))
        if any(suspends(header) for header in headers_of(statement)):
            saved = mark_awaited(saved)
        saved = without(saved, header_names(statement) | set(fresh))
        saved.update((name, parts) for name, parts in fresh.items() if parts)
        if isinstance(statement, (ast.With, ast.AsyncWith)):
            return self.scan_with(statement, saved, held)
        if isinstance(statement, LOOPS):
            return self.scan_loop(statement, saved, held)
        if isinstance(statement, TRIES):
            return self.scan_try(statement, saved, held)
        ends = [self.scan(block, saved, held) for block in blocks_of(statement)]
        if isinstance(statement, ast.If) and statement.orelse:
            return merge(*ends)
        return merge(saved, *ends)

    def scan_with(self, statement, saved, held):
        if not isinstance(statement, ast.AsyncWith):
            return self.scan(statement.body, saved, held)
        locks = {
            (id(item), ast.unparse(item.context_expr))
            for item in statement.items
            if self.keys.is_lock(item.context_expr, self.function)
        }
        end = self.scan(statement.body, mark_awaited(saved), held | locks)
        return mark_awaited(end)

    def scan_loop(self, statement, saved, held):
        entry = mark_awaited(saved) if isinstance(statement, ast.AsyncFor) else saved
        first = self.scan(statement.body, entry, held)
        again = merge(entry, first)
        if isinstance(statement, ast.AsyncFor):
            again = mark_awaited(again)
        after = merge(saved, first, self.scan(statement.body, again, held))
        return self.scan(statement.orelse, after, held)

    def scan_try(self, statement, saved, held):
        body = self.scan(statement.body, saved, held)
        during = merge(saved, body)
        ends = [
            self.scan(handler.body, without(during, {handler.name}), held)
            for handler in statement.handlers
        ]
        ends.append(self.scan(statement.orelse, body, held))
        joined = merge(*ends)
        if not statement.finalbody:
            return joined
        return self.scan(statement.finalbody, merge(joined, during), held)


def function_findings(context, function, module, keys):
    walker = Walker(context, function, Scope(context, function, module), keys)
    walker.scan(function.body, {}, frozenset())
    return list(walker.found.values())


def check(context):
    module = stored_names(context.tree)
    keys = LockKeys(context.tree, context.aliases, context.parents)
    found = []
    for function in functions_of(context.tree):
        if isinstance(function, ast.AsyncFunctionDef):
            found.extend(function_findings(context, function, module, keys))
    return found
