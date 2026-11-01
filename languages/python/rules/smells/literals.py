import ast
import re

from checks.common import finding, last_name, shown

MINIMUM_LENGTH = 5
MAXIMUM_USES = 2
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
    "__",
    "_t",
    "$t",
    "translate",
    "formatMessage",
    "getMessage",
    "getString",
    "getTranslations",
    "getFixedT",
    "useTranslation",
    "useTranslations",
}
DISCRIMINANT_KEYS = {"type", "kind", "tag", "variant"}
SKIPPED_PARENTS = (ast.JoinedStr, ast.FormattedValue)
IDIOMATIC_TEXT = {
    "utf-8",
    "utf8",
    "ascii",
    "latin-1",
    "utf-16",
    "store_true",
    "store_false",
    "store_const",
    "append",
    "append_const",
    "count",
    "version",
    "extend",
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
}
MIME_TYPE = re.compile(r"^[a-z]+/[a-z0-9.+*-]+$")
TIME_FORMAT = re.compile(r"^(?:%[A-Za-z]|[-:/ T.,_])+$")
CLASS_BODY_VALUES = (ast.Assign, ast.AnnAssign)
SEQUENCES = (ast.List, ast.Tuple, ast.Set)


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


def is_idiomatic(value):
    return (
        value in IDIOMATIC_TEXT
        or bool(MIME_TYPE.match(value))
        or ("%" in value and bool(TIME_FORMAT.match(value)))
    )


def is_discriminant_value(node, parent):
    if not isinstance(parent, ast.Dict):
        return False
    for key, value in zip(parent.keys, parent.values):
        if value is node:
            return isinstance(key, ast.Constant) and key.value in DISCRIMINANT_KEYS
    return False


def real_parent(node, parents):
    parent = parents.get(id(node))
    if type(parent).__name__ == "Index":
        return parents.get(id(parent))
    return parent


def is_subscript_key(node, parents):
    parent = real_parent(node, parents)
    return isinstance(parent, ast.Subscript) and parent.value is not node


def is_listed_constant(node, parents):
    parent = parents.get(id(node))
    if not isinstance(parent, SEQUENCES):
        return False
    holder = parents.get(id(parent))
    if not isinstance(holder, CLASS_BODY_VALUES):
        return False
    targets = holder.targets if isinstance(holder, ast.Assign) else [holder.target]
    exported = any(isinstance(t, ast.Name) and t.id == "__all__" for t in targets)
    return exported or isinstance(parents.get(id(holder)), ast.ClassDef)


def is_generated_file(tree):
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == "Migration":
            return any(last_name(base) == "Migration" for base in node.bases)
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "revision" for t in node.targets
        ):
            return True
    return False


def is_countable(node, parents, skipped):
    value = node.value
    if (
        not isinstance(value, str)
        or len(value) < MINIMUM_LENGTH
        or not ALPHANUMERIC.search(value)
        or is_idiomatic(value)
    ):
        return False
    if id(node) in skipped:
        return False
    parent = parents.get(id(node))
    if isinstance(parent, SKIPPED_PARENTS + (ast.keyword,)):
        return False
    if isinstance(parent, ast.Expr) or (
        isinstance(parent, ast.Dict) and node in parent.keys
    ):
        return False
    if type(parent).__name__.startswith("Match"):
        return False
    if (
        isinstance(parent, ast.Call)
        and last_name(parent.func) in TRANSLATION_CALLS
        and parent.args
        and parent.args[0] is node
    ):
        return False
    if is_discriminant_value(node, parent):
        return False
    if is_subscript_key(node, parents) or is_listed_constant(node, parents):
        return False
    return not is_literal_subscript(node, parents)


def check(context):
    if context.tests or is_generated_file(context.tree):
        return []
    parents = context.parents
    skipped = annotation_nodes(context.tree)
    uses = {}
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Constant) and is_countable(node, parents, skipped):
            uses.setdefault(node.value, []).append(node)
    return [
        finding(context.path, "repeated-string-literal", shown(value), node)
        for value, nodes in uses.items()
        for node in sorted(nodes, key=lambda n: (n.lineno, n.col_offset))[MAXIMUM_USES:]
    ]
