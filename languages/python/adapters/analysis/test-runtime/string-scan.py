import ast
import json
import re
import sys


DOTTED_NAME = re.compile(r"^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$")
IMPORT_CALLS = {"import_module", "__import__"}
PLUGINS = "pytest_plugins"
MODULE_FLAG = "-m"


def constant_text(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def is_container(node):
    return isinstance(node, (ast.List, ast.Tuple, ast.Set))


def sequences(call):
    found = [call.args]
    found.extend(value.elts for value in call.args if is_container(value))
    for keyword in call.keywords:
        found.append(keyword.value.elts if is_container(keyword.value) else [keyword.value])
    return found


def call_name(call):
    if isinstance(call.func, ast.Attribute):
        return call.func.attr
    if isinstance(call.func, ast.Name):
        return call.func.id
    return None


def module_names(call):
    imports = call_name(call) in IMPORT_CALLS
    names = []
    for items in sequences(call):
        for index, item in enumerate(items):
            text = constant_text(item)
            if text is None or not DOTTED_NAME.match(text):
                continue
            after_flag = index > 0 and constant_text(items[index - 1]) == MODULE_FLAG
            if "." in text or imports or after_flag:
                names.append(text)
    return names


def plugin_names(tree):
    names = []
    for node in tree.body:
        targets = node.targets if isinstance(node, ast.Assign) else [getattr(node, "target", None)]
        if not any(isinstance(target, ast.Name) and target.id == PLUGINS for target in targets):
            continue
        value = getattr(node, "value", None)
        items = value.elts if is_container(value) else [value]
        names.extend(text for text in map(constant_text, items) if text and DOTTED_NAME.match(text))
    return names


def literals_of(tree):
    strings = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            strings.update(module_names(node))
    return {"strings": sorted(strings), "plugins": sorted(set(plugin_names(tree)))}


def scan(root, files):
    scanned = {}
    for relative in files:
        try:
            with open(f"{root}/{relative}", "rb") as handle:
                found = literals_of(ast.parse(handle.read(), relative))
        except (SyntaxError, ValueError, RecursionError, OSError):
            continue
        if found["strings"] or found["plugins"]:
            scanned[relative] = found
    return scanned


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as handle:
        request = json.load(handle)
    json.dump(scan(request["root"], request["files"]), sys.stdout)
