import ast
from collections import deque

from checks.common import is_domain_path
from effects.calls import Scope, bindings, direct_effects
from effects.resolve import Caller, display, production_definitions

NESTED_SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)
SHOWN_HEAD = 4
SHOWN_TAIL = 2
ELLIPSIS = "..."


def body_nodes(function):
    pending = list(reversed(function.body))
    while pending:
        node = pending.pop()
        yield node
        if not isinstance(node, NESTED_SCOPES):
            pending.extend(reversed(list(ast.iter_child_nodes(node))))


def owner_of(qualified):
    owner, _, _ = qualified.rpartition(".")
    return owner or None


def function_facts(context, qualified, function):
    nodes = list(body_nodes(function))
    caller = Caller(context, function, owner_of(qualified))
    scope = Scope(context, bindings(nodes, context.aliases))
    effects, callees = {}, []
    for call in (node for node in nodes if isinstance(node, ast.Call)):
        for kind, name in direct_effects(call, scope).items():
            effects.setdefault(kind, name)
        callees.extend(caller.resolve(call.func))
    return effects, callees


def included_functions(project, included):
    for path, defined in sorted(production_definitions(project).items()):
        if included is None or included(path):
            yield from (
                (path, qualified, node)
                for qualified, node in defined.items()
                if not isinstance(node, ast.ClassDef)
            )


class Summaries:
    def __init__(self, project, included=None):
        self.project = project
        self.direct, self.next, callers = {}, {}, {}
        for path, qualified, function in included_functions(project, included):
            key = (path, qualified)
            context = project.contexts[path]
            effects, callees = function_facts(context, qualified, function)
            self.direct[key] = effects
            self.next[key] = {kind: None for kind in effects}
            for callee in callees:
                callers.setdefault(callee, set()).add(key)
        self.spread(callers)

    def spread(self, callers):
        pending = deque(sorted(key for key, effects in self.direct.items() if effects))
        while pending:
            callee = pending.popleft()
            gained = (
                c for c in sorted(callers.get(callee, ())) if self.gain(c, callee)
            )
            pending.extend(gained)

    def gain(self, caller, callee):
        known = self.next[caller]
        gained = [kind for kind in self.next[callee] if kind not in known]
        for kind in gained:
            known[kind] = callee
        return bool(gained)

    def kinds(self, key):
        return set(self.next.get(key, {}))

    def steps(self, key, kind):
        found, current = [], key
        while self.next[current][kind] is not None:
            current = self.next[current][kind]
            found.append((current[0], display(self.project, current)))
        return [*found, (None, self.direct[current][kind])]


def summaries_of(project):
    return project.memo("effect-summaries", Summaries)


def outside_domain_summaries(project):
    def build(_):
        return Summaries(project, lambda path: not is_domain_path(path))

    return project.memo("effect-summaries-outside-domain", build)


def chain_text(steps):
    names = [name for _path, name in steps]
    if len(names) > SHOWN_HEAD + SHOWN_TAIL + 1:
        names = [*names[:SHOWN_HEAD], ELLIPSIS, *names[-SHOWN_TAIL:]]
    return " -> ".join(names)
