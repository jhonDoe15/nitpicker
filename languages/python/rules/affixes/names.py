import ast
import re

WORD_BREAK = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[_\-\s]+")
DIRECTORY_WORDS = {
    "path", "pathname", "dir", "dirname", "directory", "folder", "root", "base",
    "route", "pkg", "cwd", "home", "homedir", "tmpdir",
}
ARGUMENT_WORDS = DIRECTORY_WORDS - {"path", "pathname"}
HOST_WORDS = {"domain", "host", "hostname", "origin", "netloc"}
LOCATION_WORDS = DIRECTORY_WORDS | HOST_WORDS | {
    "url", "href", "uri", "specifier", "importer", "filename",
}


def words_of(name):
    return [word.lower() for word in WORD_BREAK.split(name) if word]


def name_of(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Call):
        return name_of(node.func)
    if isinstance(node, (ast.Subscript, ast.Await)):
        return name_of(node.value)
    return None


def name_has(node, words):
    name = name_of(node)
    if name is None:
        return False
    parts = words_of(name)
    last = parts[-1] if parts else ""
    return last in words or (last == "name" and parts[-2:-1] == ["package"])


def is_directory_name(node):
    return name_has(node, ARGUMENT_WORDS)


def is_host_name(node):
    return name_has(node, HOST_WORDS)


def is_location_name(node):
    return name_has(node, LOCATION_WORDS)


def module_constants(tree):
    found, repeated = {}, set()
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            target = node.target
        else:
            continue
        if isinstance(target, ast.Name):
            if target.id in found:
                repeated.add(target.id)
            found[target.id] = node.value
    return {name: value for name, value in found.items() if name not in repeated}
