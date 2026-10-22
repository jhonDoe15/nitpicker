import ast

from checks.state import local_names
from effects.calls import Scope, bindings, direct_effects
from effects.resolve import Caller, display, production_definitions

NESTED_SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)


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


class FunctionFacts:
    def __init__(self, context, qualified, function):
        nodes = list(body_nodes(function))
        caller = Caller(context, owner_of(qualified), local_names(function))
        scope = Scope(context, bindings(nodes, context.aliases))
        self.effects = {}
        self.callees = []
        for call in (node for node in nodes if isinstance(node, ast.Call)):
            for kind, name in direct_effects(call, scope).items():
                self.effects.setdefault(kind, [(None, name)])
            callee = caller.resolve(call.func)
            if callee is not None:
                self.callees.append(callee)


class Summaries:
    def __init__(self, project):
        self.project = project
        self.effects = {}
        self.callees = {}
        for path, defined in production_definitions(project).items():
            context = project.contexts[path]
            for qualified, function in defined.items():
                facts = FunctionFacts(context, qualified, function)
                self.effects[(path, qualified)] = facts.effects
                self.callees[(path, qualified)] = facts.callees
        while self.spread():
            pass

    def spread(self):
        found = []
        for key in sorted(self.callees):
            known = self.effects[key]
            for callee in self.callees[key]:
                for kind, chain in self.effects.get(callee, {}).items():
                    if kind not in known and callee != key:
                        found.append((key, kind, [self.step(callee), *chain]))
        for key, kind, chain in found:
            self.effects[key].setdefault(kind, chain)
        return bool(found)

    def step(self, key):
        return key[0], display(self.project, key)

    def of(self, key):
        return self.effects.get(key, {})


def summaries_of(project):
    return project.memo("effect-summaries", Summaries)


def chain_text(steps):
    return " -> ".join(name for _path, name in steps)
