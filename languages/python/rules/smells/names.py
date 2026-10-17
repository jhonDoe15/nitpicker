import ast
import os
import re

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


FRAMEWORK_BASES = ("Manager", "QuerySet")
COMPOUND_TERMS = {"manager": "context", "managers": "context"}
VERSION_WORD = re.compile(r"^v?\d*$")
CHECKED_WORDS = 2


def name_words(name):
    words = [re.sub(r"\d+$", "", word) for word in words_of(name)]
    words = [word for word in words if word and not VERSION_WORD.match(word)]
    merged = []
    for word in words:
        if merged and COMPOUND_TERMS.get(word) == merged[-1]:
            merged.pop()
            continue
        merged.append(word)
    return merged


def is_generic(name):
    return any(word in GENERIC_WORDS for word in name_words(name)[-CHECKED_WORDS:])


def follows_framework_type(node):
    word = (words_of(node.name) or [""])[-1]
    return any(
        (words_of(last_name(base) or "") or [""])[-1] == word for base in node.bases
    )


def extends_framework_manager(tree):
    return any(
        isinstance(node, ast.ClassDef)
        and any(
            (last_name(base) or "").endswith(FRAMEWORK_BASES) for base in node.bases
        )
        for node in ast.walk(tree)
    )


def path_findings(context):
    parts = context.path.split("/")
    stem = os.path.splitext(parts[-1])[0]
    found = []
    if is_generic(stem) and not (
        stem == "managers" and extends_framework_manager(context.tree)
    ):
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
    for node in ast.walk(context.tree):
        if (
            isinstance(node, ast.ClassDef)
            and is_generic(node.name)
            and not follows_framework_type(node)
        ):
            found.append(finding(context.path, "generic-name", node.name, node))
    return found
