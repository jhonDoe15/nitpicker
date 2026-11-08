import ast

from checks.common import dotted_name, string_value
from honesty.subjects.check import argument
from honesty.subjects.targets import (
    defined_names,
    is_subject_target,
    subject_path,
    subject_stem,
)

PATCH = "mock.patch"
PATCH_OBJECT = "mock.patch.object"
SETATTR = "monkeypatch.setattr"
DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
FOLLOW_DEPTH = 4


class Definition:
    def __init__(self, path, module, name, node):
        self.path = path
        self.module = module
        self.name = name
        self.node = node

    @property
    def dotted(self):
        return f"{self.module}.{self.name}"


class Subject:
    def __init__(self, project, path):
        self.project = project
        self.path = path
        self.functions, self.classes = defined_names(project.contexts[path].tree)


def subject_of(context):
    stem = subject_stem(context.path) if context.tests else None
    path = subject_path(context, stem) if stem else None
    if path is None or path not in context.project.contexts:
        return None
    return Subject(context.project, path)


def is_subject(dotted, subject):
    return subject is not None and is_subject_target(dotted, subject)


def is_production(project, path):
    context = project.contexts.get(path)
    return context is not None and not context.tests


def top_level(tree, name):
    for node in tree.body:
        if isinstance(node, DEFINITIONS) and node.name == name:
            return node
    return None


def locate(project, dotted):
    parts = dotted.split(".")
    for size in range(len(parts) - 1, 0, -1):
        path = project.module_path(".".join(parts[:size]))
        if path is not None:
            return path, parts[size], parts[size + 1 :]
    return None


def resolve(project, dotted, depth=FOLLOW_DEPTH):
    located = locate(project, dotted) if dotted and depth > 0 else None
    if located is None or not is_production(project, located[0]):
        return None
    path, name, rest = located
    context = project.contexts[path]
    node = top_level(context.tree, name)
    if node is None:
        imported = context.aliases[0].get(name)
        target = ".".join([imported, *rest]) if imported else None
        return resolve(project, target, depth - 1) if target else None
    found = Definition(path, project.module_name(path), name, node)
    return member(found, rest)


def member(found, rest):
    if not rest:
        return found
    if len(rest) > 1 or not isinstance(found.node, ast.ClassDef):
        return None
    for item in found.node.body:
        if isinstance(item, DEFINITIONS) and item.name == rest[0]:
            return Definition(found.path, found.module, f"{found.name}.{item.name}", item)
    return None


def module_of(project, node, aliases):
    dotted = dotted_name(node, aliases) if node is not None else None
    path = project.module_path(dotted) if dotted else None
    return path if path is not None and is_production(project, path) else None


def string_target(node):
    return string_value(node) if node is not None else None


def object_target(owner, attribute, aliases):
    name = string_value(attribute) if attribute is not None else None
    dotted = dotted_name(owner, aliases) if owner is not None else None
    return f"{dotted}.{name}" if dotted and name else None


def patch_target(node, name, aliases):
    if name == PATCH:
        return string_target(argument(node, 0, "target"))
    if name == PATCH_OBJECT:
        return object_target(
            argument(node, 0, "target"), argument(node, 1, "attribute"), aliases
        )
    if name == SETATTR:
        first = argument(node, 0, "target")
        if len(node.args) >= 3:
            return object_target(first, node.args[1], aliases)
        return string_target(first)
    return None
