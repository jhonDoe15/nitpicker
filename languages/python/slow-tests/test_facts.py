import ast
import hashlib
import json
import os
import re
import sys

MARK = re.compile(r"(?:^|\.)mark\.(\w+)$")


def dotted(node):
    if isinstance(node, ast.Call):
        return dotted(node.func)
    if isinstance(node, ast.Attribute):
        base = dotted(node.value)
        return f"{base}.{node.attr}" if base else None
    if isinstance(node, ast.Name):
        return node.id
    return None


def mark_names(nodes):
    names = set()
    for node in nodes:
        found = MARK.search(dotted(node) or "")
        if found:
            names.add(found.group(1))
    return names


def mark_assignment(node):
    if isinstance(node, ast.Assign):
        targets, value = node.targets, node.value
    elif isinstance(node, ast.AnnAssign) and node.value is not None:
        targets, value = [node.target], node.value
    else:
        return set()
    if not any(isinstance(target, ast.Name) and target.id == "pytestmark" for target in targets):
        return set()
    return mark_names(value.elts if isinstance(value, (ast.List, ast.Tuple)) else [value])


def body_marks(body):
    names = set()
    for node in body:
        names |= mark_assignment(node)
    return names


def text_of(lines, node):
    first = min([node.lineno] + [decorator.lineno for decorator in node.decorator_list])
    block = " ".join(" ".join(lines[first - 1 : node.end_lineno]).split())
    return hashlib.sha1(block.encode("utf-8")).hexdigest()


def visit(body, lines, context):
    for node in body:
        if isinstance(node, ast.ClassDef):
            inherited = context["marks"] | mark_names(node.decorator_list) | body_marks(node.body)
            visit(
                node.body,
                lines,
                {"path": context["path"] + [node.name], "marks": inherited, "found": context["found"]},
            )
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            context["found"][".".join(context["path"] + [node.name])] = {
                "line": node.lineno,
                "hash": text_of(lines, node),
                "markers": sorted(context["marks"] | mark_names(node.decorator_list)),
            }


def facts(root, file):
    try:
        with open(os.path.join(root, file), encoding="utf-8") as handle:
            source = handle.read()
        tree = ast.parse(source)
        found = {}
        visit(tree.body, source.splitlines(), {"path": [], "marks": body_marks(tree.body), "found": found})
        return found
    except Exception:
        return None


if __name__ == "__main__":
    root, *files = sys.argv[1:]
    print("NITPICKER_FACTS " + json.dumps({file: facts(root, file) for file in files}))
