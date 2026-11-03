import ast
from pathlib import Path

from checks.common import dotted_name, finding, last_name
from signatures.annotations import FUNCTION_TYPES

RULE = "compatibility-shim"
WARNING_CATEGORIES = {
    "DeprecationWarning",
    "PendingDeprecationWarning",
    "FutureWarning",
}
WARN_CALLS = {"warnings.warn", "warnings.warn_explicit"}
IMPORT_CALLS = {"import_module", "__import__"}
ENTRY_POINT_TABLES = ("scripts", "gui-scripts", "entry-points")
DEPRECATED_DECORATOR = "deprecated"
DECLARATIONS = (*FUNCTION_TYPES, ast.ClassDef)
CATEGORY_POSITION = 1


def is_deprecation_category(node):
    name = last_name(node.func if isinstance(node, ast.Call) else node)
    return name is not None and (
        name in WARNING_CATEGORIES or name.endswith("DeprecationWarning")
    )


def is_warn_call(node, context):
    return isinstance(node, ast.Call) and (
        dotted_name(node.func, context.aliases) in WARN_CALLS
    )


def warning_findings(node, context):
    if not is_warn_call(node, context):
        return []
    categories = [
        keyword.value for keyword in node.keywords if keyword.arg == "category"
    ]
    if len(node.args) > CATEGORY_POSITION:
        categories.append(node.args[CATEGORY_POSITION])
    if node.args:
        categories.append(node.args[0])
    if not any(is_deprecation_category(category) for category in categories):
        return []
    return [finding(context.path, RULE, "warnings.warn(DeprecationWarning)", node)]


def decorator_findings(node, context):
    if not isinstance(node, DECLARATIONS):
        return []
    return [
        finding(context.path, RULE, f"@deprecated {node.name}", decorator)
        for decorator in node.decorator_list
        if last_name(decorator.func if isinstance(decorator, ast.Call) else decorator)
        == DEPRECATED_DECORATOR
    ]


def declared_kinds(tree):
    kinds = {}
    for statement in tree.body:
        if isinstance(statement, ast.ClassDef):
            kinds[statement.name] = "class"
        elif isinstance(statement, FUNCTION_TYPES):
            kinds[statement.name] = "function"
        elif isinstance(statement, ast.ImportFrom):
            for alias in statement.names:
                name = alias.asname or alias.name
                kinds[name] = "class" if name[:1].isupper() else "function"
    return kinds


def entry_points(_project):
    try:
        import tomllib
    except ImportError:
        return set()
    try:
        with Path("pyproject.toml").open("rb") as handle:
            data = tomllib.load(handle)
    except (OSError, ValueError):
        return set()
    project_table = data.get("project", {})
    tables = [project_table.get(key, {}) for key in ENTRY_POINT_TABLES]
    values = []
    for table in tables:
        for entry in table.values():
            values.extend(entry.values() if isinstance(entry, dict) else [entry])
    pairs = set()
    for value in values:
        module, _, attribute = str(value).partition(":")
        pairs.add((module.strip(), attribute.split(".")[0].split("[")[0].strip()))
    return pairs


def is_entry_point(alias, context):
    module = context.project.module_name(context.path)
    pairs = context.project.memo("entry-points", entry_points)
    return (module, alias) in pairs


def is_public_alias(alias, target, kinds):
    kind = kinds[target]
    if alias.startswith("_") or target.startswith("_"):
        return False
    return alias[:1].isupper() == (kind == "class")


def alias_findings(context):
    kinds = declared_kinds(context.tree)
    found = []
    for statement in context.tree.body:
        if not (
            isinstance(statement, ast.Assign)
            and len(statement.targets) == 1
            and isinstance(statement.targets[0], ast.Name)
            and isinstance(statement.value, ast.Name)
        ):
            continue
        alias, target = statement.targets[0].id, statement.value.id
        if (
            alias != target
            and target in kinds
            and is_public_alias(alias, target, kinds)
            and not is_entry_point(alias, context)
        ):
            found.append(finding(context.path, RULE, f"{alias} = {target}", statement))
    return found


def is_rename_table(node):
    return (
        isinstance(node, ast.Dict)
        and bool(node.keys)
        and all(
            isinstance(item, ast.Constant) and isinstance(item.value, str)
            for item in [*node.keys, *node.values]
            if item is not None
        )
        and None not in node.keys
    )


def module_tables(tree):
    return {
        statement.targets[0].id: statement.value
        for statement in tree.body
        if isinstance(statement, ast.Assign)
        and len(statement.targets) == 1
        and isinstance(statement.targets[0], ast.Name)
        and is_rename_table(statement.value)
    }


def is_import_call(node):
    return isinstance(node, ast.Call) and last_name(node.func) in IMPORT_CALLS


def keeps_old_names(function, context):
    nodes = list(ast.walk(function))
    if any(is_warn_call(node, context) for node in nodes):
        return True
    if any(is_import_call(node) for node in nodes):
        return False
    tables = module_tables(context.tree)
    return any(is_rename_table(node) for node in nodes) or any(
        isinstance(node, ast.Name) and node.id in tables for node in nodes
    )


def getattr_findings(context):
    return [
        finding(context.path, RULE, "__getattr__", statement)
        for statement in context.tree.body
        if isinstance(statement, FUNCTION_TYPES)
        and statement.name == "__getattr__"
        and keeps_old_names(statement, context)
    ]


def check(context):
    if context.tests:
        return []
    found = getattr_findings(context) + alias_findings(context)
    for node in ast.walk(context.tree):
        found.extend(warning_findings(node, context))
        found.extend(decorator_findings(node, context))
    return found
