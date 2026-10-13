import ast
import json
import sys


TYPE_CHECKING = "TYPE_CHECKING"
TYPING_MODULES = {"typing", "typing_extensions"}


def type_checking_names(tree):
    names = {TYPE_CHECKING}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module in TYPING_MODULES:
            names.update(a.asname for a in node.names if a.name == TYPE_CHECKING and a.asname)
    return names


def is_type_checking(test, names):
    if isinstance(test, ast.Name):
        return test.id in names
    if isinstance(test, ast.Attribute):
        return test.attr == TYPE_CHECKING
    if isinstance(test, ast.BoolOp) and isinstance(test.op, ast.And):
        return any(is_type_checking(value, names) for value in test.values)
    return False


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


def collect(nodes, type_only, names, found):
    for node in nodes:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            found.append(statement_of(node, type_only))
        elif isinstance(node, ast.If) and is_type_checking(node.test, names):
            collect(node.body, True, names, found)
            collect(node.orelse, type_only, names, found)
        else:
            collect(ast.iter_child_nodes(node), type_only, names, found)


def imports_of(tree):
    found = []
    collect([tree], False, type_checking_names(tree), found)
    return found


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
