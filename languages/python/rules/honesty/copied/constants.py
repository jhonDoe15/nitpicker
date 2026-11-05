import ast
import re
from collections import Counter

CONSTANT_NAME = re.compile(r"^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$")
TRIVIAL_NUMBERS = {-1, 0, 1, 2}
MIN_TEXT_LENGTH = 3


def literal_key(node):
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        inner = literal_key(node.operand)
        if inner is not None and inner[0] != "str":
            return inner[0], -inner[1]
        return None
    if not isinstance(node, ast.Constant):
        return None
    value = node.value
    if isinstance(value, bool):
        return None
    if isinstance(value, str):
        return "str", value
    if isinstance(value, (int, float)):
        return "number", value
    return None


def is_trivial(key):
    kind, value = key
    if kind == "str":
        return len(value) < MIN_TEXT_LENGTH or not value.strip()
    return value in TRIVIAL_NUMBERS


def is_test_named(path):
    stem = path.split("/")[-1]
    return stem.startswith("test_") or stem.endswith("_test.py")


def declared(statement):
    if isinstance(statement, ast.Assign):
        return [(target, statement.value) for target in statement.targets]
    if isinstance(statement, ast.AnnAssign) and statement.value is not None:
        return [(statement.target, statement.value)]
    return []


def is_constant_name(name):
    return len(name) >= 2 and bool(CONSTANT_NAME.match(name))


def assigned_names(tree):
    names = [
        target.id
        for statement in tree.body
        for target, _ in declared(statement)
        if isinstance(target, ast.Name)
    ]
    return {name for name, count in Counter(names).items() if count > 1}


def module_constants(tree):
    reassigned = assigned_names(tree)
    found = []
    for statement in tree.body:
        for target, value in declared(statement):
            key = literal_key(value)
            named = isinstance(target, ast.Name) and is_constant_name(target.id)
            if named and target.id not in reassigned and key and not is_trivial(key):
                found.append((target.id, key))
    return found


def production_constants(project):
    from security.support import support_files

    support = project.memo("security-support-files", support_files)
    found = {}
    for path, context in project.contexts.items():
        if context.tests or path in support or is_test_named(path):
            continue
        constants = module_constants(context.tree)
        if constants:
            found[path] = (project.module_name(path), constants)
    return found
