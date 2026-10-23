import ast

from checks.common import dotted_name, finding, last_name
from signatures.annotations import FUNCTION_TYPES

RULE = "compatibility-shim"
WARNING_CATEGORIES = {"DeprecationWarning", "PendingDeprecationWarning"}
WARN_CALLS = {"warnings.warn", "warnings.warn_explicit"}
DEPRECATED_DECORATOR = "deprecated"
DECLARATIONS = (*FUNCTION_TYPES, ast.ClassDef)
CATEGORY_POSITION = 1


def is_deprecation_category(node):
    name = last_name(node)
    return name is not None and (
        name in WARNING_CATEGORIES or name.endswith("DeprecationWarning")
    )


def warning_findings(node, context):
    if not isinstance(node, ast.Call):
        return []
    if dotted_name(node.func, context.aliases) not in WARN_CALLS:
        return []
    categories = [
        keyword.value for keyword in node.keywords if keyword.arg == "category"
    ]
    if len(node.args) > CATEGORY_POSITION:
        categories.append(node.args[CATEGORY_POSITION])
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


def bound_names(tree):
    declared, imported = set(), set()
    for statement in tree.body:
        if isinstance(statement, DECLARATIONS):
            declared.add(statement.name)
        elif isinstance(statement, ast.ImportFrom):
            imported.update(alias.asname or alias.name for alias in statement.names)
    return declared | imported


def alias_findings(context):
    bound = bound_names(context.tree)
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
        if alias != target and target in bound and not alias.startswith("_"):
            found.append(finding(context.path, RULE, f"{alias} = {target}", statement))
    return found


def getattr_findings(context):
    return [
        finding(context.path, RULE, "__getattr__", statement)
        for statement in context.tree.body
        if isinstance(statement, FUNCTION_TYPES) and statement.name == "__getattr__"
    ]


def check(context):
    if context.tests:
        return []
    found = getattr_findings(context) + alias_findings(context)
    for node in ast.walk(context.tree):
        found.extend(warning_findings(node, context))
        found.extend(decorator_findings(node, context))
    return found
