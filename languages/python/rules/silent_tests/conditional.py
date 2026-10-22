import ast

from checks.common import dotted_name, finding
from silent_tests.calls import SCOPES, called_name, is_assertion_node, test_functions
from silent_tests.helpers import assertion_helpers, is_test_file

RULE = "conditional-assertion-in-test"
SKIP_CALLS = {"pytest.skip", "pytest.xfail", "pytest.importorskip"}
LOOPS = (ast.For, ast.AsyncFor)
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
SIMPLE_CONSTRUCTS = (
    (ast.While, "while"),
    (ast.If, "if"),
    (ast.IfExp, "if"),
    (ast.Match, "match"),
    (ast.BoolOp, "boolean"),
    (ast.ExceptHandler, "except"),
)


def is_skip(node, aliases):
    if not isinstance(node, ast.Call):
        return False
    if dotted_name(node.func, aliases) in SKIP_CALLS:
        return True
    return isinstance(node.func, ast.Attribute) and node.func.attr == "skipTest"


def is_check(node, aliases, helpers):
    if is_skip(node, aliases):
        return False
    if is_assertion_node(node, aliases, helpers):
        return True
    if not isinstance(node, ast.Call):
        return False
    return called_name(node.func, aliases, helpers["modules"]) in helpers["names"]


def is_subtest(node):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "subTest"
    )


def construct_kind(node):
    if isinstance(node, LOOPS):
        return "subTest" if any(is_subtest(n) for n in ast.walk(node)) else "for"
    if isinstance(node, COMPREHENSIONS):
        return "comprehension"
    for node_type, kind in SIMPLE_CONSTRUCTS:
        if isinstance(node, node_type):
            return kind
    return None


def reads_caught_name(node, names):
    return isinstance(node, ast.Assert) and any(
        isinstance(part, ast.Name) and part.id in names for part in ast.walk(node)
    )


def next_state(node, state):
    kind, outer, names = state
    if isinstance(node, ast.ExceptHandler) and node.name:
        names = names | {node.name}
    construct = construct_kind(node)
    if construct is not None and kind is None:
        return construct, node, names
    return kind, outer, names


def visit(node, state, context, found):
    if isinstance(node, SCOPES):
        return
    kind, outer, names = state
    if is_check(node, context.aliases, context.helpers):
        if kind is not None and not reads_caught_name(node, names):
            found.setdefault(id(outer), (kind, node))
        return
    inner = next_state(node, state)
    for child in ast.iter_child_nodes(node):
        visit(child, inner, context, found)


class Scan:
    def __init__(self, context, helpers):
        self.aliases = context.aliases
        self.helpers = helpers


def conditional_checks(function, scan):
    found = {}
    for statement in function.body:
        visit(statement, (None, None, frozenset()), scan, found)
    return sorted(found.values(), key=lambda item: item[1].lineno)


def check(context):
    if not is_test_file(context):
        return []
    scan = Scan(context, assertion_helpers(context.project))
    return [
        finding(context.path, RULE, f"{name}: {kind}", node)
        for name, function in test_functions(context.tree)
        for kind, node in conditional_checks(function, scan)
    ]
