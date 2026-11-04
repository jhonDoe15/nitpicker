import ast

from checks.common import finding, is_type_checking_block
from effects.calls import EXTERNAL, IO, Scope, bindings, direct_effects
from effects.resolve import Caller, display
from effects.summaries import chain_text, summaries_of
from environment.environment import is_main_guard
from environment.roots import is_composition_root
from index.scopes import DEFINITIONS, FUNCTIONS
from security.support import exempt

RULE = "import-time-effect"
GUARDED = True
CALL = "call"
DECORATOR = "decorator"


def expression_calls(node):
    pending = [node]
    while pending:
        current = pending.pop()
        if isinstance(current, ast.Call):
            yield CALL, current
        if isinstance(current, ast.Lambda):
            pending.extend(default_values(current.args))
        else:
            pending.extend(ast.iter_child_nodes(current))


def default_values(arguments):
    return [*arguments.defaults, *(value for value in arguments.kw_defaults if value)]


def definition_heads(node):
    for decorator in node.decorator_list:
        if not isinstance(decorator, ast.Call):
            yield DECORATOR, decorator
        yield from expression_calls(decorator)
    if isinstance(node, ast.ClassDef):
        heads = [*node.bases, *(keyword.value for keyword in node.keywords)]
    else:
        heads = default_values(node.args)
    for head in heads:
        yield from expression_calls(head)


def skips_body(node, aliases):
    return isinstance(node, ast.If) and (
        is_main_guard(node) or is_type_checking_block(node, aliases)
    )


def evaluated(node, aliases):
    pending = [node]
    while pending:
        current = pending.pop()
        if skips_body(current, aliases):
            pending.extend(reversed(current.orelse))
            continue
        children = []
        if isinstance(current, DEFINITIONS):
            yield from definition_heads(current)
        if isinstance(current, ast.ClassDef):
            children = current.body
        if isinstance(current, ast.expr):
            yield from expression_calls(current)
        elif not isinstance(current, DEFINITIONS):
            children = list(ast.iter_child_nodes(current))
        pending.extend(reversed(children))


def load_time_statements(tree):
    pending = list(tree.body)
    while pending:
        node = pending.pop()
        yield node
        if not isinstance(node, FUNCTIONS):
            pending.extend(ast.iter_child_nodes(node))


def is_out_of_scope(context):
    return exempt(context) or is_composition_root(context)


class ImportTime:
    def __init__(self, context):
        self.context = context
        self.caller = Caller(context)
        self.summaries = summaries_of(context.project)
        nodes = load_time_statements(context.tree)
        self.scope = Scope(context, bindings(nodes, context.aliases))

    def direct(self, call):
        effects = direct_effects(call, self.scope)
        if EXTERNAL not in effects or (self.context.domain and IO in effects):
            return None
        return finding(self.context.path, RULE, effects[EXTERNAL], call)

    def callee(self, target):
        for key in self.caller.resolve(target):
            kinds = self.summaries.kinds(key)
            if EXTERNAL in kinds:
                return key, kinds
        return None, set()

    def through_helper(self, site, target):
        callee, kinds = self.callee(target)
        if callee is None or (self.context.domain and IO in kinds):
            return None
        name = display(self.context.project, callee)
        item = finding(self.context.path, RULE, name, site)
        steps = self.summaries.steps(callee, EXTERNAL)
        item["via"] = chain_text([(callee[0], name), *steps])
        return item

    def finding(self, kind, node):
        if kind == DECORATOR:
            return self.through_helper(node, node)
        return self.direct(node) or self.through_helper(node, node.func)


def check(context):
    if is_out_of_scope(context):
        return []
    effects = ImportTime(context)
    found = (
        effects.finding(kind, node)
        for statement in context.tree.body
        for kind, node in evaluated(statement, context.aliases)
    )
    return [item for item in found if item is not None]
