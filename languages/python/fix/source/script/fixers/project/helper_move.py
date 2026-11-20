import ast
import re

from discovery.helpers import HELPER_DIRECTORIES
from fixers.project.scan import module_mentioned, names_mentioned
from review.project.index import attribute_chain
from source_text import refuse, replacement

TEST_ROOTS = ("tests", "test")
SUPPORT = "support"
FROM_MODULE = re.compile(r"from\s+([\w.]+)\s+import\b")


def target_of(index, path):
    parts = path.split("/")
    if parts[-1] == "__init__.py":
        refuse("a package marker stays with its package")
    inside = [number for number, part in enumerate(parts[:-1]) if part in HELPER_DIRECTORIES]
    rest = parts[inside[0] + 1 :] if inside else parts[-1:]
    root = next((name for name in TEST_ROOTS if f"{name}/__init__.py" in index.trees), None)
    if root is None:
        refuse("the project has no importable tests package to hold the helper")
    target = "/".join([root, SUPPORT, *rest])
    if target in index.trees:
        refuse("the new name exists")
    return target


def helper_folder(path, module):
    name = next((part for part in path.split("/")[:-1] if part in HELPER_DIRECTORIES), None)
    parts = module.split(".")
    return ".".join(parts[: parts.index(name) + 1]) if name in parts else ""


def check_helper_source(path, tree, module):
    folder = helper_folder(path, module)
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            if node.level:
                refuse("the helper imports by relative path")
            if folder and node.module and (node.module + ".").startswith(folder + "."):
                refuse("the helper imports a module of its own folder")
        elif isinstance(node, ast.Name) and node.id == "__file__":
            refuse("the helper locates files by its own path")


def module_text_edit(source, node, new_module):
    text = source.source_of(node)
    found = FROM_MODULE.match(text)
    if node.level or found is None or found.group(1) != node.module:
        refuse("a caller imports the helper in a form --fix does not rewrite")
    start = source.span(node)[0]
    return replacement(start + found.start(1), start + found.end(1), new_module)


def from_edit(index, sources, other, node, helper, new_module):
    base = index.import_base(other, node)
    source = sources[other]
    if index.paths.get(base) == helper:
        return module_text_edit(source, node, new_module)
    submodules = [
        name for name in node.names if index.paths.get(f"{base}.{name.name}") == helper
    ]
    if submodules and len(node.names) > 1:
        refuse("a caller imports the helper together with other names")
    if submodules:
        return module_text_edit(source, node, new_module.rsplit(".", 1)[0])
    for name in node.names:
        found = index.exported(base, name.name) if base else None
        if found is not None and found[0] == helper:
            refuse("another module re-exports a name of the helper")
    return None


def import_edit(sources, other, node, module, new_module):
    for name in node.names:
        if name.name != module and not name.name.startswith(module + "."):
            continue
        if name.asname is None or name.name != module:
            refuse("a caller imports the helper without a name of its own")
        start = sources[other].span(name)[0]
        return replacement(start, start + len(module), new_module)
    return None


def reaches_by_attribute(index, other, tree, module):
    for node in ast.walk(tree):
        chain = attribute_chain(node) if isinstance(node, ast.Attribute) else None
        binding = index.binding(other, node, chain[0]) if chain else None
        if binding is None or binding[0] != "module" or binding[1] == module:
            continue
        parts = binding[1].split(".") + chain[1:]
        if any(".".join(parts[: size + 1]) == module for size in range(len(parts))):
            refuse("a caller reaches the helper through a module attribute")


def importer_edits(index, sources, helper, module, new_module):
    edits = {}
    for other, tree in index.trees.items():
        if other == helper:
            continue
        found = []
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                found.append(from_edit(index, sources, other, node, helper, new_module))
            elif isinstance(node, ast.Import):
                found.append(import_edit(sources, other, node, module, new_module))
        found = [edit for edit in found if edit is not None]
        if found and other not in index.tests:
            refuse(f"{other} is production code that imports it")
        reaches_by_attribute(index, other, tree, module)
        if found:
            edits[other] = found
    return edits


def helper_move(index, sources, editable, path):
    module = index.modules[path]
    target = target_of(index, path)
    new_module = index.project.module_name(target)
    if module_mentioned(index, module) or names_mentioned(index, module):
        refuse("a string or a non-Python file in the project names the helper")
    check_helper_source(path, index.trees[path], module)
    edits = importer_edits(index, sources, path, module, new_module)
    edits[path] = [{"type": "move", "from": path, "to": target}]
    if not set(edits) <= editable:
        refuse("a caller sits in a file --fix does not cover")
    marker = f"{target.split('/')[0]}/{SUPPORT}/__init__.py"
    if marker not in index.trees:
        edits[marker] = [{"type": "write", "path": marker, "text": ""}]
    return edits
