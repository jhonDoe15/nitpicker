import ast

from checks.common import dotted_name

FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
SELF_NAMES = {"self", "cls"}
CONSTRUCTOR = "__init__"
REEXPORT_HOPS = 8


def definitions(tree):
    found = {}
    for node in tree.body:
        if isinstance(node, FUNCTIONS):
            found[node.name] = node
        elif isinstance(node, ast.ClassDef):
            for item in node.body:
                if isinstance(item, FUNCTIONS):
                    found[f"{node.name}.{item.name}"] = item
    return found


def production_definitions(project):
    def build(_):
        return {
            path: definitions(context.tree)
            for path, context in project.contexts.items()
            if not context.tests
        }

    return project.memo("effect-definitions", build)


def in_module(project, path, parts, hops):
    defined = production_definitions(project).get(path)
    if defined is None:
        return None
    qualified = ".".join(parts)
    for candidate in (qualified, f"{qualified}.{CONSTRUCTOR}"):
        if candidate in defined:
            return path, candidate
    names, modules = project.contexts[path].aliases[:2]
    target = names.get(parts[0]) or modules.get(parts[0])
    if target is None or hops >= REEXPORT_HOPS:
        return None
    return resolve_dotted(project, ".".join([target, *parts[1:]]), hops + 1)


def resolve_dotted(project, dotted, hops=0):
    parts = dotted.split(".")
    for size in range(len(parts) - 1, 0, -1):
        path = project.module_path(".".join(parts[:size]))
        if path is not None:
            return in_module(project, path, parts[size:], hops)
    return None


def root_name(node):
    while isinstance(node, ast.Attribute):
        node = node.value
    return node.id if isinstance(node, ast.Name) else None


class Caller:
    def __init__(self, context, owner=None, shadowed=frozenset()):
        self.context = context
        self.owner = owner
        self.shadowed = shadowed

    def resolve(self, target):
        root = root_name(target)
        if root is None or root in self.shadowed and root not in SELF_NAMES:
            return None
        project = self.context.project
        if root in SELF_NAMES and isinstance(target, ast.Attribute):
            return self.own_method(target)
        names, modules = self.context.aliases[:2]
        dotted = dotted_name(target, self.context.aliases)
        if root in names or root in modules:
            return resolve_dotted(project, dotted)
        return in_module(project, self.context.path, dotted.split("."), REEXPORT_HOPS)

    def own_method(self, target):
        if self.owner is None or not isinstance(target.value, ast.Name):
            return None
        parts = [self.owner, target.attr]
        return in_module(self.context.project, self.context.path, parts, REEXPORT_HOPS)


def display(project, key):
    return f"{project.module_name(key[0])}.{key[1]}"
