import ast

from checks.common import finding, is_boundary_path, is_domain_path
from effects.resolve import Caller, display
from effects.summaries import chain_text, outside_domain_summaries
from index.scopes import DEFINITIONS, enclosing_function, enclosing_owner

RULE = "helper-chain io-in-domain, clock-now and random-in-domain"
GUARDED = True
RULES = (("io", "io-in-domain"), ("clock", "clock-now"), ("random", "random-in-domain"))
DOMAIN_KINDS = {kind for kind, _rule in RULES}


def is_outside_domain(path, context):
    return path != context.path and not (is_domain_path(path) or is_boundary_path(path))


def call_sites(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            yield node, node.func
        elif isinstance(node, DEFINITIONS):
            yield from (
                (decorator, decorator)
                for decorator in node.decorator_list
                if not isinstance(decorator, ast.Call)
            )


class DomainCalls:
    def __init__(self, context):
        self.context = context
        self.summaries = outside_domain_summaries(context.project)
        self.callers = {}

    def caller(self, function):
        if id(function) not in self.callers:
            owner = enclosing_owner(function, self.context.parents)
            label = [] if function is None else [(None, function.name)]
            if owner and function is not None:
                label = [(None, f"{owner}.{function.name}")]
            caller = Caller(self.context, function, owner)
            self.callers[id(function)] = caller, label
        return self.callers[id(function)]

    def callee(self, site, target):
        function = enclosing_function(site, self.context.parents)
        caller, label = self.caller(function)
        for key in caller.resolve(target):
            kinds = self.summaries.kinds(key) & DOMAIN_KINDS
            if kinds and is_outside_domain(key[0], self.context):
                return key, label
        return None, label

    def findings(self, site, target):
        callee, label = self.callee(site, target)
        if callee is None:
            return []
        project = self.context.project
        name = display(project, callee)
        found = []
        for kind, rule in RULES:
            if kind in self.summaries.kinds(callee):
                item = finding(self.context.path, rule, name, site)
                steps = [*label, (callee[0], name), *self.summaries.steps(callee, kind)]
                item["via"] = chain_text(steps)
                found.append(item)
        return found


def check(context):
    if not context.domain:
        return []
    calls = DomainCalls(context)
    return [
        item
        for site, target in call_sites(context.tree)
        for item in calls.findings(site, target)
    ]
