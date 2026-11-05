import ast

from checks.common import imported_module


def import_targets(node, project, path):
    if isinstance(node, ast.Import):
        return [alias.name for alias in node.names]
    if isinstance(node, ast.ImportFrom):
        module = imported_module(node, project, path)
        if not module:
            return []
        return [module] + [f"{module}.{alias.name}" for alias in node.names]
    return []


def seen_modules(context, constants):
    project = context.project
    seen = set()
    for node in ast.walk(context.tree):
        for dotted in import_targets(node, project, context.path):
            path = project.module_path(dotted)
            if path in constants:
                seen.add(path)
    return sorted(seen)
