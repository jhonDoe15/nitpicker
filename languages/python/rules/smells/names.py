import ast
import os

from checks.common import finding, last_name, words_of

GENERIC_WORDS = {
    "util",
    "utils",
    "utility",
    "utilities",
    "helper",
    "helpers",
    "manager",
    "managers",
    "common",
    "commons",
    "misc",
    "miscellaneous",
}


def is_generic(name):
    return (words_of(name) or [""])[-1] in GENERIC_WORDS


def follows_framework_type(node):
    word = (words_of(node.name) or [""])[-1]
    return any(
        (words_of(last_name(base) or "") or [""])[-1] == word for base in node.bases
    )


def path_findings(context):
    parts = context.path.split("/")
    stem = os.path.splitext(parts[-1])[0]
    found = []
    if is_generic(stem):
        found.append(
            {"rule": "generic-name", "path": context.path, "subject": stem, "line": 1}
        )
    folder = next((part for part in parts[:-1] if is_generic(part)), None)
    if folder is not None:
        found.append(
            {
                "rule": "generic-name",
                "path": context.path,
                "subject": f"{folder}/",
                "line": 1,
            }
        )
    return found


def check(context):
    if context.tests:
        return []
    found = path_findings(context)
    for node in context.tree.body:
        if (
            isinstance(node, ast.ClassDef)
            and is_generic(node.name)
            and not follows_framework_type(node)
        ):
            found.append(finding(context.path, "generic-name", node.name, node))
    return found
