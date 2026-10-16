import ast
import re

from checks.common import finding, last_name

MINIMUM_LENGTH = 5
MAXIMUM_USES = 2
SHOWN_LENGTH = 30
ALPHANUMERIC = re.compile(r"[A-Za-z0-9]")
TRANSLATION_CALLS = {
    "_",
    "gettext",
    "ngettext",
    "pgettext",
    "lazy_gettext",
    "gettext_lazy",
    "gettext_noop",
    "t",
}
SKIPPED_PARENTS = (ast.JoinedStr, ast.FormattedValue)


def annotation_nodes(tree):
    skipped = set()
    for node in ast.walk(tree):
        annotations = []
        if isinstance(node, ast.AnnAssign):
            annotations.append(node.annotation)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            arguments = node.args
            every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
            every += [a for a in (arguments.vararg, arguments.kwarg) if a]
            annotations.extend(a.annotation for a in every if a.annotation)
            annotations.append(node.returns)
        for annotation in annotations:
            if annotation is not None:
                skipped.update(id(child) for child in ast.walk(annotation))
    return skipped


def is_literal_subscript(node, parents):
    parent = parents.get(id(node))
    while parent is not None:
        if isinstance(parent, ast.Subscript) and last_name(parent.value) == "Literal":
            return True
        parent = parents.get(id(parent))
    return False


def parent_map(tree):
    return {
        id(child): parent
        for parent in ast.walk(tree)
        for child in ast.iter_child_nodes(parent)
    }


def is_countable(node, parents, skipped):
    value = node.value
    if (
        not isinstance(value, str)
        or len(value) < MINIMUM_LENGTH
        or not ALPHANUMERIC.search(value)
    ):
        return False
    if id(node) in skipped:
        return False
    parent = parents.get(id(node))
    if isinstance(parent, SKIPPED_PARENTS):
        return False
    if isinstance(parent, ast.Expr) or (
        isinstance(parent, ast.Dict) and node in parent.keys
    ):
        return False
    if type(parent).__name__.startswith("Match"):
        return False
    if isinstance(parent, ast.Call) and last_name(parent.func) in TRANSLATION_CALLS:
        return False
    return not is_literal_subscript(node, parents)


def shown(value):
    return value[:SHOWN_LENGTH] + "..." if len(value) > SHOWN_LENGTH else value


def check(context):
    if context.tests:
        return []
    parents = parent_map(context.tree)
    skipped = annotation_nodes(context.tree)
    uses = {}
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Constant) and is_countable(node, parents, skipped):
            uses.setdefault(node.value, []).append(node)
    return [
        finding(context.path, "repeated-string-literal", shown(value), nodes[0])
        for value, nodes in sorted(uses.items(), key=lambda item: item[1][0].lineno)
        if len(nodes) > MAXIMUM_USES
    ]
