import ast
from typing import NamedTuple

from checks.common import finding, functions_of
from concurrency.evaluation import events_of, same_path, suspends
from concurrency.locks import constructed_locks, is_lock
from concurrency.shared import Scope, stored_names
from concurrency.statements import blocks_of, headers_of, is_compound, written_targets

RULE = "atomic-update-across-await"
DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)


class Saved(NamedTuple):
    locations: frozenset
    locks: frozenset
    awaited: bool


def reads_through(text, target):
    location = ast.unparse(target)
    if text == location or text.startswith((location + ".", location + "[")):
        return True
    if not isinstance(target, ast.Subscript):
        return False
    container = ast.unparse(target.value)
    return text == container or text.startswith(container + ".")


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
        entry = saved.get(local_root(event.text)) if event.kind == "read" else None
        if entry is None or entry.locks & locks:
            continue
        if not any(reads_through(place, target) for place in entry.locations):
            continue
        later = events[position + 1 :]
        if entry.awaited or any(e.kind == "await" for e in later):
            return True
    return False


def forget_overwritten(statement, saved):
    for target in written_targets(statement):
        for name, entry in list(saved.items()):
            if any(reads_through(place, target) for place in entry.locations):
                del saved[name]


def mark_awaited(saved):
    for name, entry in saved.items():
        saved[name] = entry._replace(awaited=True)


class Walker:
    def __init__(self, context, function, scope, constructed):
        self.context = context
        self.function = function
        self.scope = scope
        self.constructed = constructed
        self.found = {}

    def report(self, statement, target):
        text = ast.unparse(target)
        subject = f"{text} in {self.function.name}"
        key = (id(statement), text)
        if key not in self.found:
            self.found[key] = finding(self.context.path, RULE, subject, statement)

    def shared_reads(self, expression):
        return frozenset(
            event.text
            for event in events_of(expression)
            if event.kind == "read" and self.scope.is_shared_location(event.node)
        )

    def check_write(self, statement, saved, locks):
        for target in written_targets(statement):
            if not self.scope.is_shared_location(target):
                continue
            if not locks and stale_inside(statement, target):
                self.report(statement, target)
            elif stale_through_local(statement, target, saved, locks):
                self.report(statement, target)

    def remember(self, statement, saved, locks):
        places = self.shared_reads(statement.value)
        for target in statement.targets:
            if places and isinstance(target, ast.Name):
                saved[target.id] = Saved(places, frozenset(locks), False)

    def scan(self, statements, saved, locks):
        for statement in statements:
            if isinstance(statement, DEFINITIONS):
                continue
            if is_compound(statement):
                self.scan_compound(statement, saved, locks)
            else:
                self.scan_simple(statement, saved, locks)

    def scan_simple(self, statement, saved, locks):
        self.check_write(statement, saved, locks)
        forget_overwritten(statement, saved)
        for name in stored_names(statement):
            saved.pop(name, None)
        if suspends(statement):
            mark_awaited(saved)
        elif isinstance(statement, ast.Assign):
            self.remember(statement, saved, locks)

    def scan_compound(self, statement, saved, locks):
        if any(suspends(header) for header in headers_of(statement)):
            mark_awaited(saved)
        if isinstance(statement, (ast.AsyncFor, ast.AsyncWith)):
            mark_awaited(saved)
        inner = locks
        if isinstance(statement, ast.AsyncWith) and any(
            is_lock(item.context_expr, self.constructed) for item in statement.items
        ):
            inner = locks | {id(statement)}
        for block in blocks_of(statement):
            self.scan(block, dict(saved), inner)
        forget_overwritten(statement, saved)
        for name in stored_names(statement):
            saved.pop(name, None)
        if suspends(statement):
            mark_awaited(saved)


def function_findings(context, function, module, constructed):
    walker = Walker(context, function, Scope(context, function, module), constructed)
    walker.scan(function.body, {}, frozenset())
    return list(walker.found.values())


def check(context):
    module = stored_names(context.tree)
    constructed = constructed_locks(context.tree, context.aliases)
    found = []
    for function in functions_of(context.tree):
        if isinstance(function, ast.AsyncFunctionDef):
            found.extend(function_findings(context, function, module, constructed))
    return found
