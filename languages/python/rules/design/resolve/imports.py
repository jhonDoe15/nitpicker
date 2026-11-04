import ast
from collections import namedtuple

from design.resolve.symbols import ModuleRef, PrefixRef

TRY_TYPES = tuple(t for t in (ast.Try, getattr(ast, "TryStar", None)) if t is not None)


Binding = namedtuple(
    "Binding", "kind path name directory dotted", defaults=(None, None, None, None)
)


def import_statements(tree):
    pending = list(tree.body)
    for statement in pending:
        if isinstance(statement, (ast.Import, ast.ImportFrom)):
            yield statement
        elif isinstance(statement, ast.If):
            pending.extend(statement.body + statement.orelse)
        elif isinstance(statement, TRY_TYPES):
            handlers = [s for handler in statement.handlers for s in handler.body]
            pending.extend(
                statement.body + handlers + statement.orelse + statement.finalbody
            )
        elif isinstance(statement, (ast.With, ast.AsyncWith)):
            pending.extend(statement.body)


def relative_directory(importer, level):
    parts = importer.split("/")[:-1]
    if level - 1 > len(parts):
        return None
    return parts[: len(parts) - (level - 1)]


def join_path(parts, suffix):
    return "/".join([*parts, suffix]) if parts else suffix


def module_in(index, parts):
    if not parts:
        return "__init__.py" if "__init__.py" in index.modules else None
    for candidate in (
        join_path(parts[:-1], f"{parts[-1]}.py"),
        join_path(parts, "__init__.py"),
    ):
        if candidate in index.modules:
            return candidate
    return None


def locate_module(index, importer, node):
    level, dotted = node.level, node.module
    if level == 0:
        found = index.module_path(dotted) if dotted else None
        return found if found in index.modules else None
    base = relative_directory(importer, level)
    if base is None:
        return None
    return module_in(index, base + (dotted.split(".") if dotted else []))


def relative_target_directory(importer, level, dotted):
    base = relative_directory(importer, level)
    if base is None:
        return None
    return base + (dotted.split(".") if dotted else [])


def from_directory(importer, node, base):
    if node.level > 0:
        return relative_target_directory(importer, node.level, node.module)
    package = base is not None and base.endswith("__init__.py")
    return base.split("/")[:-1] if package else None


def bind_from(index, module, node):
    base = locate_module(index, module.path, node)
    directory = from_directory(module.path, node, base)
    if base is not None and any(alias.name == "*" for alias in node.names):
        module.stars.append(base)
    for alias in (alias for alias in node.names if alias.name != "*"):
        local = alias.asname or alias.name
        module.count(local)
        module.imports[local] = Binding(
            "from", base, alias.name, directory, node.module
        )


def bind_import(index, module, node):
    for alias in node.names:
        path = index.module_path(alias.name)
        path = path if path in index.modules else None
        if alias.asname:
            module.count(alias.asname)
            module.imports[alias.asname] = Binding("module", path, dotted=alias.name)
            continue
        root = alias.name.split(".")[0]
        module.count(root)
        root_path = index.module_path(root)
        root_path = root_path if root_path in index.modules else None
        module.imports[root] = Binding("prefix", root_path, dotted=root)


def bind_imports(index, module):
    for node in import_statements(module.tree):
        if isinstance(node, ast.ImportFrom):
            bind_from(index, module, node)
        else:
            bind_import(index, module, node)


def submodule(index, binding, name):
    if binding.directory is not None:
        found = module_in(index, [*binding.directory, name])
        if found is not None:
            return ModuleRef(found)
    if binding.dotted and binding.directory is None:
        path = index.module_path(f"{binding.dotted}.{name}")
        if path in index.modules:
            return ModuleRef(path)
    return None


def resolve_binding(index, binding, seen):
    from design.resolve.lookup import lookup_seen

    if binding.kind == "module":
        if binding.path is None:
            return None
        return ModuleRef(binding.path)
    if binding.kind == "prefix":
        if binding.path is not None:
            return ModuleRef(binding.path)
        return PrefixRef(binding.dotted)
    if binding.path is not None:
        found = lookup_seen(index, (index.modules[binding.path], binding.name), seen)
        if found is not None:
            return found
    return submodule(index, binding, binding.name)
