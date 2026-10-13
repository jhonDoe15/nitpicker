import ast
import json
import sys


def imports_of(tree):
    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.append({"level": 0, "module": None, "names": [a.name for a in node.names]})
        elif isinstance(node, ast.ImportFrom):
            found.append(
                {"level": node.level, "module": node.module, "names": [a.name for a in node.names]}
            )
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
