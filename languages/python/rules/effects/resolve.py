import ast

from index.scopes import (
    FUNCTIONS,
    IMPORT,
    LOCAL,
    chain_parts,
    definitions,
    function_bindings,
    module_bindings,
)

SELF_NAMES = {"self", "cls"}
CONSTRUCTOR = "__init__"
REEXPORT_HOPS = 16


def production_definitions(project):
    def build(_):
        return {
            path: definitions(context.tree)
            for path, context in project.contexts.items()
            if not context.tests
        }

    return project.memo("effect-definitions", build)


def split_module(project, dotted):
    parts = dotted.split(".")
    for size in range(len(parts) - 1, 0, -1):
        path = project.module_path(".".join(parts[:size]))
        if path is not None:
            return path, parts[size:]
    return None


def reexported(context, rest):
    found = []
    for kind, target in module_bindings(context).targets(rest[0]):
        if kind == IMPORT:
            found.append(".".join([target, *rest[1:]]))
        elif kind == LOCAL and target != rest[0]:
            module = context.project.module_name(context.path)
            found.append(".".join([module, target, *rest[1:]]))
    return found


def rebound_by_import(context, name):
    targets = module_bindings(context).targets(name)
    return bool(targets) and all(kind == IMPORT for kind, _target in targets)


def follow(project, dotted, accept):
    pending, seen, found = [dotted], set(), []
    while pending and len(seen) < REEXPORT_HOPS:
        current = pending.pop(0)
        located = split_module(project, current) if current not in seen else None
        seen.add(current)
        context = project.contexts.get(located[0]) if located else None
        if context is None:
            continue
        own = (
            None
            if rebound_by_import(context, located[1][0])
            else accept(project, located)
        )
        found.extend([own] if own is not None and own not in found else [])
        pending.extend(reexported(context, located[1]))
    return found


def function_at(project, located):
    path, rest = located
    defined = production_definitions(project).get(path, {})
    qualified = ".".join(rest)
    for candidate in (qualified, f"{qualified}.{CONSTRUCTOR}"):
        if isinstance(defined.get(candidate), FUNCTIONS):
            return path, candidate
    return None


def class_at(project, located):
    path, rest = located
    qualified = ".".join(rest)
    node = production_definitions(project).get(path, {}).get(qualified)
    return (path, qualified) if isinstance(node, ast.ClassDef) else None


class Caller:
    def __init__(self, context, function=None, owner=None):
        self.context = context
        self.owner = owner
        self.bindings = (
            function_bindings(context, function)
            if function is not None
            else module_bindings(context)
        )

    def resolve(self, target, accept=function_at):
        root, parts = chain_parts(target)
        if root in SELF_NAMES and self.owner and len(parts) == 1:
            key = accept(
                self.context.project, (self.context.path, [self.owner, *parts])
            )
            return [key] if key else []
        keys = []
        for kind, value in self.bindings.targets(root) if root else []:
            found = self.target_keys((kind, value), parts, accept)
            keys.extend(key for key in found if key not in keys)
        return keys

    def target_keys(self, target, parts, accept):
        kind, value = target
        project = self.context.project
        if kind == LOCAL:
            key = accept(project, (self.context.path, [*value.split("."), *parts]))
            return [key] if key is not None else []
        if kind == IMPORT:
            return follow(project, ".".join([value, *parts]), accept)
        return []


def display(project, key):
    return f"{project.module_name(key[0])}.{key[1]}"
