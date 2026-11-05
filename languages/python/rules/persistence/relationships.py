import ast

from checks.common import dotted_name, finding

SQLALCHEMY_ROOTS = ("sqlalchemy.", "flask_sqlalchemy.")
RELATIONSHIP_NAMES = {"relationship", "relation"}
BACKREF_NAME = "backref"
SQLMODEL_ROOT = "sqlmodel."
SQLMODEL_NAME = "Relationship"
SQLMODEL_OPTIONS = "sa_relationship_kwargs"
RELATIONSHIP, BACKREF, SQLMODEL = "relationship", "backref", "sqlmodel"


class Relation:
    def __init__(self, call, kind, options):
        self.call = call
        self.kind = kind
        self.options = options


def call_kind(call, context):
    name = dotted_name(call.func, context.aliases) or ""
    last = name.rsplit(".", 1)[-1]
    attribute = isinstance(call.func, ast.Attribute)
    if name.startswith(SQLMODEL_ROOT) and last == SQLMODEL_NAME:
        return SQLMODEL
    if not (name.startswith(SQLALCHEMY_ROOTS) or attribute):
        return None
    if last in RELATIONSHIP_NAMES:
        return RELATIONSHIP
    return BACKREF if last == BACKREF_NAME else None


def dict_entries(node):
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


def enclosing_assignment(node, context):
    current = context.parents.get(id(node))
    while current is not None and not isinstance(current, ast.ClassDef):
        if isinstance(current, (ast.Assign, ast.AnnAssign)):
            return current
        current = context.parents.get(id(current))
    return None


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


def subject_of(relation, context):
    if relation.kind == BACKREF and backref_name(relation.call):
        owner = enclosing_class(relation.call, context)
        prefix = f"{owner.name} " if owner is not None else ""
        return f"{prefix}backref {backref_name(relation.call)}"
    assignment = enclosing_assignment(relation.call, context)
    name = target_name(assignment) if assignment is not None else None
    owner = enclosing_class(relation.call, context)
    if owner is not None and name is not None:
        return f"{owner.name}.{name}"
    return name or "relationship"


def relation_finding(context, rule, relation, node):
    return finding(context.path, rule, subject_of(relation, context), node)
