import ast
import json
import sys


TYPE_CHECKING = "TYPE_CHECKING"
TYPING_MODULES = {"typing", "typing_extensions"}


def is_false_assignment(node):
    return (
        isinstance(node, ast.Assign)
        and isinstance(node.value, ast.Constant)
        and node.value.value is False
        and any(isinstance(target, ast.Name) and target.id == TYPE_CHECKING for target in node.targets)
    )


def type_checking_names(tree):
    names = set()
    modules = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module in TYPING_MODULES:
            names.update(a.asname or a.name for a in node.names if a.name == TYPE_CHECKING)
        elif isinstance(node, ast.Import):
            modules.update(a.asname or a.name for a in node.names if a.name in TYPING_MODULES)
    if any(is_false_assignment(node) for node in tree.body):
        names.add(TYPE_CHECKING)
    return names, modules


def is_type_checking(test, flags):
    names, modules = flags
    if isinstance(test, ast.Name):
        return test.id in names
    if isinstance(test, ast.Attribute):
        return (
            test.attr == TYPE_CHECKING
            and isinstance(test.value, ast.Name)
            and test.value.id in modules
        )
    if isinstance(test, ast.BoolOp) and isinstance(test.op, ast.And):
        return any(is_type_checking(value, flags) for value in test.values)
    return False


def branches(node, type_only, flags):
    if is_type_checking(node.test, flags):
        return [(node.body, True), (node.orelse, type_only)]
    negated = isinstance(node.test, ast.UnaryOp) and isinstance(node.test.op, ast.Not)
    if negated and is_type_checking(node.test.operand, flags):
        return [(node.body, type_only), (node.orelse, True)]
    return None


def statement_of(node, type_only):
    if isinstance(node, ast.Import):
        return {
            "level": 0,
            "module": None,
            "names": [a.name for a in node.names],
            "typeOnly": type_only,
        }
    return {
        "level": node.level,
        "module": node.module,
        "names": [a.name for a in node.names],
        "typeOnly": type_only,
    }


def collect(root, flags):
    found = []
    stack = [(root, False)]
    while stack:
        node, type_only = stack.pop()
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            found.append(statement_of(node, type_only))
            continue
        split = branches(node, type_only, flags) if isinstance(node, ast.If) else None
        if split is None:
            pending = [(child, type_only) for child in ast.iter_child_nodes(node)]
        else:
            pending = [(child, flag) for statements, flag in split for child in statements]
        stack.extend(reversed(pending))
    return found


def imports_of(tree):
    return collect(tree, type_checking_names(tree))


def scan(root, files):
    scanned = {}
    for relative in files:
        try:
            with open(f"{root}/{relative}", "rb") as handle:
                scanned[relative] = imports_of(ast.parse(handle.read(), relative))
        except (SyntaxError, ValueError, RecursionError, OSError):
            continue
    return scanned


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as handle:
        request = json.load(handle)
    json.dump(scan(request["root"], request["files"]), sys.stdout)
