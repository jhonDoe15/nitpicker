import ast

from checks.common import dotted_name, finding

SQLALCHEMY_ROOTS = ("sqlalchemy.", "flask_sqlalchemy.")
RELATIONSHIP_NAMES = {"relationship", "relation"}
BACKREF_NAME = "backref"
SQLMODEL_ROOT = "sqlmodel."
SQLMODEL_NAME = "Relationship"
SQLMODEL_OPTIONS = "sa_relationship_kwargs"
RELATIONSHIP, BACKREF, SQLMODEL = "relationship", "backref", "sqlmodel"
ORM_MODULES = ("sqlalchemy", "flask_sqlalchemy", "sqlmodel")
DB_RECEIVER = "db"


class Relation:
    def __init__(self, call, kind, options):
        self.call = call
        self.kind = kind
        self.options = options


def imports_orm(context):
    def build(_):
        for node in ast.walk(context.tree):
            if isinstance(node, ast.Import):
                modules = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0:
                modules = [node.module or ""]
            else:
                continue
            if any(module.split(".")[0] in ORM_MODULES for module in modules):
                return True
        return False

    return context.project.memo(("imports-orm", context.path), build)


def orm_receiver(call, context):
    if not isinstance(call.func, ast.Attribute):
        return False
    receiver = call.func.value
    named_db = isinstance(receiver, ast.Name) and receiver.id == DB_RECEIVER
    return named_db or imports_orm(context)


def call_kind(call, context):
    name = dotted_name(call.func, context.aliases) or ""
    last = name.rsplit(".", 1)[-1]
    if name.startswith(SQLMODEL_ROOT) and last == SQLMODEL_NAME:
        return SQLMODEL
    if not (name.startswith(SQLALCHEMY_ROOTS) or orm_receiver(call, context)):
        return None
    if last in RELATIONSHIP_NAMES:
        return RELATIONSHIP
    return BACKREF if last == BACKREF_NAME else None


def dict_entries(node):
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "dict"
    ):
        return {keyword.arg: keyword.value for keyword in node.keywords if keyword.arg}
    if not isinstance(node, ast.Dict):
        return {}
    return {
        key.value: value
        for key, value in zip(node.keys, node.values)
        if isinstance(key, ast.Constant) and isinstance(key.value, str)
    }


def call_options(call, kind):
    options = {}
    for keyword in call.keywords:
        if keyword.arg is None:
            options.update(dict_entries(keyword.value))
        else:
            options[keyword.arg] = keyword.value
    if kind == SQLMODEL:
        options.update(dict_entries(options.get(SQLMODEL_OPTIONS)))
    if kind == RELATIONSHIP and len(call.args) > 1 and "secondary" not in options:
        options["secondary"] = call.args[1]
    return options


def relations(context):
    def build(_):
        found = []
        for node in ast.walk(context.tree):
            if isinstance(node, ast.Call):
                kind = call_kind(node, context)
                if kind is not None:
                    found.append(Relation(node, kind, call_options(node, kind)))
        return found

    return context.project.memo(("orm-relations", context.path), build)


def enclosing_class(node, context):
    current = context.parents.get(id(node))
    while current is not None and not isinstance(current, ast.ClassDef):
        current = context.parents.get(id(current))
    return current


def target_name(assignment):
    targets = (
        assignment.targets
        if isinstance(assignment, ast.Assign)
        else [assignment.target]
    )
    for target in targets:
        if isinstance(target, ast.Name):
            return target.id
        if isinstance(target, ast.Attribute):
            return target.attr
    return None


def backref_name(call):
    first = call.args[0] if call.args else None
    return (
        first.value
        if isinstance(first, ast.Constant) and isinstance(first.value, str)
        else None
    )


def named_slot(call, context):
    parent = context.parents.get(id(call))
    if isinstance(parent, ast.Dict):
        for key, value in zip(parent.keys, parent.values):
            if (
                value is call
                and isinstance(key, ast.Constant)
                and isinstance(key.value, str)
            ):
                return key.value
    if isinstance(parent, ast.Return):
        current = context.parents.get(id(parent))
        while current is not None and not isinstance(
            current, (ast.FunctionDef, ast.AsyncFunctionDef)
        ):
            current = context.parents.get(id(current))
        return current.name if current is not None else None
    return None


def assigned_name(call, context):
    if isinstance(context.parents.get(id(call)), (ast.Assign, ast.AnnAssign)):
        return target_name(context.parents[id(call)])
    return None


def subject_of(relation, context):
    if relation.kind == BACKREF and backref_name(relation.call):
        owner = enclosing_class(relation.call, context)
        prefix = f"{owner.name} " if owner is not None else ""
        return f"{prefix}backref {backref_name(relation.call)}"
    name = named_slot(relation.call, context) or assigned_name(relation.call, context)
    owner = enclosing_class(relation.call, context)
    if owner is not None and name is not None:
        return f"{owner.name}.{name}"
    return name or "relationship"


def relation_finding(context, rule, relation, node):
    return finding(context.path, rule, subject_of(relation, context), node)
