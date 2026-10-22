import ast

from checks.common import TEST_DIRECTORIES, directories, dotted_name, finding
from effects.calls import EXTERNAL, Scope, bindings, direct_effects
from effects.resolve import FUNCTIONS, Caller, display
from effects.summaries import body_nodes, chain_text, summaries_of
from environment.environment import is_main_guard
from environment.roots import is_composition_root, stem_of

RULE = "import-time-effect"
TYPE_CHECKING_NAMES = {
    "TYPE_CHECKING",
    "typing.TYPE_CHECKING",
    "typing_extensions.TYPE_CHECKING",
}
TEST_MODULES = {"conftest"}
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


def is_type_checking_block(node, aliases):
    return (
        isinstance(node, ast.If)
        and dotted_name(node.test, aliases) in TYPE_CHECKING_NAMES
    )


def skips_body(node, aliases):
    return isinstance(node, ast.If) and (
        is_main_guard(node) or is_type_checking_block(node, aliases)
    )


def evaluated(node, aliases):
    if skips_body(node, aliases):
        for statement in node.orelse:
            yield from evaluated(statement, aliases)
        return
    if isinstance(node, (*FUNCTIONS, ast.ClassDef)):
        yield from definition_heads(node)
    if isinstance(node, ast.ClassDef):
        for statement in node.body:
            yield from evaluated(statement, aliases)
    if isinstance(node, ast.expr):
        yield from expression_calls(node)
    elif not isinstance(node, (*FUNCTIONS, ast.ClassDef)):
        for child in ast.iter_child_nodes(node):
            yield from evaluated(child, aliases)


def is_out_of_scope(context):
    return (
        context.tests
        or stem_of(context.path) in TEST_MODULES
        or bool(TEST_DIRECTORIES.intersection(directories(context.path)))
        or is_composition_root(context)
    )


class ImportTime:
    def __init__(self, context):
        self.context = context
        self.caller = Caller(context)
        self.summaries = summaries_of(context.project)
        top = list(body_nodes(context.tree))
        self.scope = Scope(context, bindings(top, context.aliases))

    def direct(self, call):
        effects = direct_effects(call, self.scope)
        if EXTERNAL not in effects or (self.context.domain and "io" in effects):
            return None
        return finding(self.context.path, RULE, effects[EXTERNAL], call)

    def through_helper(self, site, target):
        callee = self.caller.resolve(target)
        summary = self.summaries.of(callee) if callee else {}
        steps = summary.get(EXTERNAL)
        if not steps or (self.context.domain and "io" in summary):
            return None
        item = finding(self.context.path, RULE, callee[1], site)
        head = (callee[0], display(self.context.project, callee))
        item["via"] = chain_text([head, *steps])
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
