import ast

from checks.common import dotted_name, last_name
from checks.common import parameter_names as common_names
from signatures.annotations import FUNCTION_TYPES

MAX_DEPTH = 12


def top_level(path, name, project, kinds):
    context = project.contexts.get(path)
    for node in context.tree.body if context else []:
        if isinstance(node, kinds) and node.name == name:
            return node, context
    return None


def class_index(project):
    def build(_):
        found = {}
        for path, context in project.contexts.items():
            if path not in project.test_files:
                for node in context.tree.body:
                    if isinstance(node, ast.ClassDef):
                        found.setdefault(node.name, []).append((node, context))
        return found

    return project.memo(("forwarding-class-index",), build)


def unique_class(expr, context):
    names, modules = context.aliases[:2]
    if not isinstance(expr, ast.Name) or expr.id in names or expr.id in modules:
        return None
    found = class_index(context.project).get(expr.id, [])
    return found[0] if len(found) == 1 else None


def resolve(expr, context, kinds):
    name = last_name(expr)
    if not name:
        return None
    module, _, _ = (dotted_name(expr, context.aliases) or "").rpartition(".")
    if module:
        path = context.project.module_path(module)
        return top_level(path, name, context.project, kinds) if path else None
    return top_level(context.path, name, context.project, kinds)


def resolve_class(expr, context):
    return resolve(expr, context, ast.ClassDef) or unique_class(expr, context)


def find_method(cls, context, name, depth=0):
    if depth > MAX_DEPTH:
        return None
    for item in cls.body:
        if isinstance(item, FUNCTION_TYPES) and item.name == name:
            return item
    for base in cls.bases:
        found = resolve_class(base, context)
        method = find_method(found[0], found[1], name, depth + 1) if found else None
        if method is not None:
            return method
    return None


def enclosing_class(node, context):
    parent = context.parents.get(id(node))
    while parent is not None and not isinstance(parent, ast.ClassDef):
        parent = context.parents.get(id(parent))
    return parent


def parameter_names(function):
    arguments = function.args
    star = {item.arg for item in (arguments.vararg, arguments.kwarg) if item}
    return sorted(common_names(function) - star - {"self", "cls"})
