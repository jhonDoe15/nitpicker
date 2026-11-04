import ast
import re

CONSTANT_NAME = re.compile(r"^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$")
TRIVIAL_NUMBERS = {-1, 0, 1, 2}
MIN_TEXT_LENGTH = 3
SUPPORT_DIRECTORIES = {"tests", "test", "fixtures", "fixture", "__fixtures__"}


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
        return type(value).__name__, value
    return None


def is_trivial(key):
    kind, value = key
    if kind == "str":
        return len(value) < MIN_TEXT_LENGTH or not value.strip()
    return value in TRIVIAL_NUMBERS


def is_support_path(path):
    parts = path.split("/")
    stem = parts[-1]
    return (
        stem == "conftest.py"
        or stem.startswith("test_")
        or stem.endswith("_test.py")
        or bool(SUPPORT_DIRECTORIES.intersection(parts[:-1]))
    )


def declared(statement):
    if isinstance(statement, ast.Assign):
        return [(target, statement.value) for target in statement.targets]
    if isinstance(statement, ast.AnnAssign) and statement.value is not None:
        return [(statement.target, statement.value)]
    return []


def module_constants(tree):
    found = []
    for statement in tree.body:
        for target, value in declared(statement):
            key = literal_key(value)
            valid = isinstance(target, ast.Name) and len(target.id) >= 2
            if valid and key and CONSTANT_NAME.match(target.id) and not is_trivial(key):
                found.append((target.id, key))
    return found


def production_constants(project):
    found = {}
    for path, context in project.contexts.items():
        if context.tests or is_support_path(path):
            continue
        constants = module_constants(context.tree)
        if constants:
            found[path] = (project.module_name(path), constants)
    return found
