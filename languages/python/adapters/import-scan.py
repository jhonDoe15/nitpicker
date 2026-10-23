import ast
import json
import os
import sys
import tokenize

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "facts"), os.path.join(os.path.dirname(HERE), "rules")]

from python_facts import decoded, facts_of


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


def statement_of(node, type_only, conditional):
    return {
        "level": getattr(node, "level", 0),
        "module": getattr(node, "module", None),
        "names": [a.name for a in node.names],
        "typeOnly": type_only,
        "conditional": conditional,
        "line": node.lineno,
        "aliases": [{"name": a.name, "alias": a.asname} for a in node.names],
    }


def collect(root, flags):
    found = []
    stack = [(root, False, False)]
    while stack:
        node, type_only, conditional = stack.pop()
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            found.append(statement_of(node, type_only, conditional))
            continue
        split = branches(node, type_only, flags) if isinstance(node, ast.If) else None
        if split is None:
            nested = conditional or not isinstance(node, ast.Module)
            pending = [(child, type_only, nested) for child in ast.iter_child_nodes(node)]
        else:
            pending = [
                (child, flag, conditional) for statements, flag in split for child in statements
            ]
        stack.extend(reversed(pending))
    return found


def imports_of(tree):
    return collect(tree, type_checking_names(tree))


def scan_file(root, relative, with_facts):
    with open(f"{root}/{relative}", "rb") as handle:
        source = handle.read()
    tree = ast.parse(source, relative)
    imports = imports_of(tree)
    if not with_facts:
        return imports
    return facts_of(relative, tree, decoded(source), imports)


def scan(root, files, with_facts=False):
    scanned = {}
    for relative in files:
        try:
            scanned[relative] = scan_file(root, relative, with_facts)
        except (SyntaxError, ValueError, RecursionError, OSError, tokenize.TokenError):
            continue
    return scanned


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as handle:
        request = json.load(handle)
    json.dump(scan(request["root"], request["files"], request.get("facts") is True), sys.stdout)
