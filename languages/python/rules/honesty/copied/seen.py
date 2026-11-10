import ast

from checks.common import dotted_name, imported_module


LOADERS = {"importlib.import_module", "__import__", "pytest.importorskip"}


def loaded_module(node, aliases):
    if not isinstance(node, ast.Call) or dotted_name(node.func, aliases) not in LOADERS:
        return []
    first = node.args[0] if node.args else None
    text = first.value if isinstance(first, ast.Constant) else None
    return [text] if isinstance(text, str) and not text.startswith(".") else []


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
        targets = import_targets(node, project, context.path)
        for dotted in targets + loaded_module(node, context.aliases):
            path = project.module_path(dotted)
            if path in constants:
                seen.add(path)
    return sorted(seen)
