import ast

from checks.common import finding, shown
from honesty.weak.forms import OPERANDS, truthy_form, unittest_form
from honesty.weak.mocks import mock_form

RULE = "weak-assertion"
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
NEVER = (0, 0)
SHOWN_CODE_LENGTH = 60


def sites(tree):
    pending = [(tree, tree)]
    while pending:
        node, scope = pending.pop()
        if isinstance(node, (ast.Assert, ast.Call)):
            yield node, scope
        inner = node if isinstance(node, FUNCTIONS) else scope
        pending.extend((child, inner) for child in ast.iter_child_nodes(node))


def form_of(node, aliases):
    if isinstance(node, ast.Assert):
        return truthy_form(node.test)
    if not isinstance(node.func, ast.Attribute):
        return None
    return unittest_form(node) or mock_form(node, aliases)


def code_of(node):
    if isinstance(node, ast.Assert):
        return f"assert {ast.unparse(node.test)}"
    return ast.unparse(node)


def last_uses(scope):
    last = {}
    for node in ast.walk(scope):
        if isinstance(node, OPERANDS):
            key = ast.dump(node)
            last[key] = max(last.get(key, NEVER), (node.lineno, node.col_offset))
    return last


def is_narrowing(form, node, scope, tables):
    if form.narrowed is None:
        return False
    if id(scope) not in tables:
        tables[id(scope)] = last_uses(scope)
    end = (node.end_lineno, node.end_col_offset)
    return tables[id(scope)].get(ast.dump(form.narrowed), NEVER) > end


def check(context):
    if not context.tests:
        return []
    tables = {}
    found = []
    for node, scope in sites(context.tree):
        form = form_of(node, context.aliases)
        if form is not None and not is_narrowing(form, node, scope, tables):
            found.append(finding(context.path, RULE, shown(code_of(node), SHOWN_CODE_LENGTH), node))
    return sorted(found, key=lambda item: item["line"])
