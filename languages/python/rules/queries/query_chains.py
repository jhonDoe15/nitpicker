import ast

from checks.common import dotted_name, own_nodes
from security.resolve.scopes import scope_of

ORM_MODULES = ("sqlalchemy", "sqlmodel", "flask_sqlalchemy")
SELECTS = {
    "sqlalchemy.select",
    "sqlalchemy.sql.select",
    "sqlalchemy.future.select",
    "sqlalchemy.sql.expression.select",
    "sqlmodel.select",
}
DJANGO_MODEL = {"django.db.models.Model", "models.Model", "Model"}
MANAGER = "objects"


def imports_any(context, prefixes):
    names, modules = context.aliases[:2]
    return any(value.split(".")[0] in prefixes for value in [*names.values(), *modules.values()])


def chain_of(node):
    steps = []
    while True:
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            steps.append((node.func.attr, node))
            node = node.func.value
        elif isinstance(node, ast.Attribute):
            steps.append((node.attr, None))
            node = node.value
        elif isinstance(node, ast.Subscript):
            steps.append(("[]", node))
            node = node.value
        else:
            return node, steps[::-1]


def is_outermost(node, context):
    parent = context.parents.get(id(node))
    if isinstance(parent, ast.Attribute):
        return False
    return not (isinstance(parent, ast.Subscript) and parent.value is node)


def assigned_values(name, node, context):
    scope = scope_of(node, context) or context.tree
    values = []
    for item in own_nodes(scope):
        if isinstance(item, ast.Assign):
            targets = item.targets
        elif isinstance(item, (ast.AnnAssign, ast.AugAssign, ast.NamedExpr)):
            targets = [item.target]
        else:
            continue
        if any(isinstance(target, ast.Name) and target.id == name for target in targets):
            values.append(item.value)
    return values


def expanded(node, context, seen=()):
    """The roots and steps of a query chain, through local variables that hold its builder. A step list
    that continues the variable itself (`stmt = stmt.where(...)`) has the root None; the result is None
    when a value of the variable comes from somewhere the scan cannot follow."""
    root, steps = chain_of(node)
    if not isinstance(root, ast.Name):
        return [(root, steps)]
    if root.id in seen:
        return [(None, steps)]
    values = assigned_values(root.id, node, context)
    if not values:
        return [(root, steps)]
    chains = []
    for value in values:
        inner = expanded(value, context, (*seen, root.id)) if value is not None else None
        if inner is None:
            return None
        chains.extend((inner_root, inner_steps + steps) for inner_root, inner_steps in inner)
    return chains


def is_select_root(root, context):
    return isinstance(root, ast.Call) and dotted_name(root.func, context.aliases) in SELECTS


def sqlalchemy_query(chains, context):
    if not imports_any(context, ORM_MODULES):
        return False
    rooted = [(root, steps) for root, steps in chains if root is not None]
    return bool(rooted) and all(
        is_select_root(root, context) or any(name == "query" for name, _ in steps)
        for root, steps in rooted
    )


def django_models(project):
    found = {}
    for context in project.contexts.values():
        for node in ast.walk(context.tree):
            if isinstance(node, ast.ClassDef):
                found.setdefault(node.name, []).append((node, context))
    return found


def meta_ordering(cls):
    for item in cls.body:
        if isinstance(item, ast.ClassDef) and item.name == "Meta":
            for statement in item.body:
                targets = getattr(statement, "targets", [getattr(statement, "target", None)])
                if any(
                    isinstance(target, ast.Name) and target.id == "ordering" for target in targets
                ):
                    return True
    return False


def custom_manager(cls):
    for item in cls.body:
        if isinstance(item, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == MANAGER for target in item.targets
        ):
            return True
    return False


def unordered_model(name, project, depth=0):
    """True for a Django model the project declares whose `Meta` (and its bases') sets no ordering."""
    classes = project.memo("query-order-classes", django_models).get(name, [])
    if len(classes) != 1 or depth > 4:
        return False
    cls, context = classes[0]
    if meta_ordering(cls) or custom_manager(cls):
        return False
    for base in cls.bases:
        dotted = dotted_name(base, context.aliases) or ""
        if dotted in DJANGO_MODEL or dotted.endswith(".models.Model"):
            continue
        if not isinstance(base, ast.Name) or not unordered_model(base.id, project, depth + 1):
            return False
    return bool(cls.bases)
