import ast

from checks.common import words_of
from effects.tables import (
    GETTER_LOOKUPS,
    METHOD_NAMES,
    METHOD_PREFIXES,
    OWNER_KINDS,
    PRIORITY,
)

SELF_NAMES = {"self", "cls"}
ARGUMENTS = "(...)"
EMPTY = "()"
INDEX = "[...]"


def is_input_output_method(name):
    first, *rest = words_of(name) or [""]
    if first == "get":
        return not rest or rest[0] in GETTER_LOOKUPS
    return name in METHOD_NAMES or first in METHOD_PREFIXES


def chain_names(node):
    names = []
    while True:
        if isinstance(node, ast.Await):
            node = node.value
        elif isinstance(node, ast.Call):
            node = node.func
        elif isinstance(node, ast.Attribute):
            names.insert(0, node.attr)
            node = node.value
        elif isinstance(node, ast.Subscript):
            node = node.value
        else:
            if isinstance(node, ast.Name):
                names.insert(0, node.id)
            return names


def chain_tokens(node):
    tokens = []
    while True:
        if isinstance(node, ast.Await):
            node = node.value
        elif isinstance(node, ast.Call):
            tokens.insert(0, ARGUMENTS if node.args or node.keywords else EMPTY)
            node = node.func
        elif isinstance(node, ast.Attribute):
            tokens.insert(0, f".{node.attr}")
            node = node.value
        elif isinstance(node, ast.Subscript):
            tokens.insert(0, INDEX)
            node = node.value
        else:
            if isinstance(node, ast.Name):
                tokens.insert(0, node.id)
            return tokens


def call_text(node):
    tokens = chain_tokens(node.func if isinstance(node, ast.Call) else node)
    while tokens and tokens[0] in {ARGUMENTS, EMPTY, INDEX}:
        tokens.pop(0)
    if tokens and tokens[0].startswith("."):
        tokens[0] = tokens[0][1:]
    return "".join(tokens) + "()"


def primary(effects):
    return next((kind for kind in PRIORITY if kind in effects), None)


def spec_kind(spec, method):
    if method in spec.methods:
        return spec.methods[method]
    if spec.default is None:
        return None
    return spec.default if not spec.named or is_input_output_method(method) else None


def name_kind(names):
    owners = names[:-1]
    if not owners or not is_input_output_method(names[-1]):
        return None
    for owner in reversed(owners):
        kind = OWNER_KINDS.get((words_of(owner) or [""])[-1])
        if kind is not None:
            return kind
    return None


def shorter(path, other):
    return other is None or (len(path), path) < (len(other), other)
