import ast

from kinds.names import shorter
from kinds.scope import IoScope
from kinds.sites import calls_in_order

PASSES = 6
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


class IoIndex:
    def __init__(self):
        self.functions = {}
        self.definitions = {}
        self.callees = {}

    def method_effects(self, name):
        keys = self.definitions.get(name, [])
        if not keys or not all(key in self.functions for key in keys):
            return {}
        common = set.intersection(*(set(self.functions[key]) for key in keys))
        return {
            kind: min(
                (self.functions[key][kind] for key in keys),
                key=lambda path: (len(path), path),
            )
            for kind in common
        }


def qualified_functions(tree):
    found, pending = [], [(tree, "")]
    while pending:
        node, prefix = pending.pop()
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (*FUNCTIONS, ast.ClassDef)):
                name = f"{prefix}{child.name}"
                if isinstance(child, FUNCTIONS):
                    found.append((name, child))
                pending.append((child, f"{name}."))
            else:
                pending.append((child, prefix))
    return sorted(found, key=lambda pair: (pair[1].lineno, pair[1].col_offset))


def functions_of(context):
    key = ("io-functions", context.path)
    return context.project.memo(key, lambda _: qualified_functions(context.tree))


def add_definitions(context, index):
    for _qualified, function in functions_of(context):
        if isinstance(context.parents.get(id(function)), ast.ClassDef):
            index.definitions.setdefault(function.name, []).append(id(function))


def io_index(project):
    def build(_):
        index = IoIndex()
        contexts = [c for c in project.contexts.values() if not c.tests]
        for context in contexts:
            add_definitions(context, index)
        for _ in range(PASSES):
            changed = False
            for context in contexts:
                changed = mark_io_functions(context, index) or changed
            if not changed:
                break
        return index

    return project.memo("io-index", build)


def mark_io_functions(context, index):
    scope = IoScope(context, index)
    changed = False
    for _qualified, function in functions_of(context):
        summary = dict(index.functions.get(id(function), {}))
        for call in calls_in_order(function):
            for kind, path in scope.effects(call).items():
                if shorter(path, summary.get(kind)):
                    summary[kind] = path
                    changed = True
        if summary:
            index.functions[id(function)] = summary
    return changed


def io_scope(context):
    return IoScope(context, io_index(context.project))
