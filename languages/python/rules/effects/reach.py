import ast

from checks.common import finding, is_boundary_path, is_domain_path
from checks.state import local_names
from effects.resolve import FUNCTIONS, Caller, display
from effects.summaries import chain_text, summaries_of

RULES = (("io", "io-in-domain"), ("clock", "clock-now"), ("random", "random-in-domain"))


def enclosing_function(node, parents):
    while id(node) in parents:
        node = parents[id(node)]
        if isinstance(node, FUNCTIONS):
            return node
    return None


def is_outside_domain(path, context):
    return path != context.path and not (is_domain_path(path) or is_boundary_path(path))


class DomainCalls:
    def __init__(self, context):
        self.context = context
        self.callers = {}

    def caller(self, function):
        if function is None:
            return Caller(self.context), []
        if id(function) not in self.callers:
            owner = self.context.parents.get(id(function))
            name = owner.name if isinstance(owner, ast.ClassDef) else None
            label = f"{name}.{function.name}" if name else function.name
            caller = Caller(self.context, name, local_names(function))
            self.callers[id(function)] = caller, [(None, label)]
        return self.callers[id(function)]

    def findings(self, call):
        function = enclosing_function(call, self.context.parents)
        caller, label = self.caller(function)
        callee = caller.resolve(call.func)
        if callee is None or not is_outside_domain(callee[0], self.context):
            return []
        project = self.context.project
        summary = summaries_of(project).of(callee)
        found = []
        for kind, rule in RULES:
            steps = summary.get(kind, [])
            if steps and not any(path and is_domain_path(path) for path, _ in steps):
                item = finding(self.context.path, rule, callee[1], call)
                via = [*label, (callee[0], display(project, callee)), *steps]
                item["via"] = chain_text(via)
                found.append(item)
        return found


def check(context):
    if not context.domain:
        return []
    calls = DomainCalls(context)
    return [
        item
        for node in ast.walk(context.tree)
        if isinstance(node, ast.Call)
        for item in calls.findings(node)
    ]
