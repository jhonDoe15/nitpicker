import ast
from collections import namedtuple

from checks.common import dotted_name
from orm.models import class_assignments
from soft_delete.fields import SOFT_FIELDS, mentions

SoftModel = namedtuple("SoftModel", "name fields kind")
MANAGER = "Manager"
SQL_ROOTS = ("sqlalchemy", "sqlmodel", "flask_sqlalchemy")
MAX_DEPTH = 5


def project_classes(project):
    def build(_):
        found = {}
        for context in project.contexts.values():
            if context.tests:
                continue
            for node in ast.walk(context.tree):
                if isinstance(node, ast.ClassDef):
                    found.setdefault(node.name, []).append((node, context))
        return {name: items[0] for name, items in found.items() if len(items) == 1}

    return project.memo("soft-delete-classes", build)


def base_names(cls):
    names = []
    for base in cls.bases:
        node = base.value if isinstance(base, ast.Subscript) else base
        if isinstance(node, ast.Name):
            names.append(node.id)
        elif isinstance(node, ast.Attribute):
            names.append(node.attr)
    return names


def field_kind(value, context):
    dotted = (
        dotted_name(value.func, context.aliases) if isinstance(value, ast.Call) else ""
    )
    if dotted and dotted.startswith("django"):
        return "django"
    if dotted and dotted.startswith(SQL_ROOTS):
        return "sqlalchemy"
    return None


def own_fields(cls, context):
    return {
        name: field_kind(value, context)
        for name, value in class_assignments(cls)
        if name in SOFT_FIELDS and field_kind(value, context)
    }


def lineage(cls, context, classes, depth=0):
    found = [(cls, context)]
    if depth < MAX_DEPTH:
        for name in base_names(cls):
            if name in classes and classes[name][0] is not cls:
                found.extend(lineage(*classes[name], classes, depth + 1))
    return found


def manager_state(call, context, classes):
    node = call.func
    if isinstance(node, ast.Attribute) and node.attr == "as_manager":
        return "plain"
    if any(
        isinstance(n, ast.Attribute) and n.attr == "from_queryset"
        for n in ast.walk(call)
    ):
        return "unknown"
    name = node.id if isinstance(node, ast.Name) else getattr(node, "attr", "")
    if name == MANAGER:
        return "plain"
    if name in classes:
        members = [m for c, _ in lineage(*classes[name], classes) for m in c.body]
        queries = [
            m
            for m in members
            if isinstance(m, ast.FunctionDef) and m.name == "get_queryset"
        ]
        return "filters" if any(mentions(m, SOFT_FIELDS) for m in queries) else "plain"
    return "unknown"


def objects_state(chain, classes):
    entries = {}
    for cls, context in reversed(chain):
        for name, value in class_assignments(cls):
            if isinstance(value, ast.Call) and is_manager_call(value):
                entries[name] = manager_state(value, context, classes)
    if not entries:
        return "plain"
    return entries.get("objects", "unknown")


def is_manager_call(call):
    text = ast.unparse(call.func)
    return MANAGER in text or "as_manager" in text


def loader_targets(project):
    def build(_):
        names = set()
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if isinstance(node, ast.Call) and node.args:
                    called = ast.unparse(node.func).split(".")[-1]
                    if called == "with_loader_criteria":
                        names.add(ast.unparse(node.args[0]).split(".")[-1])
        return names

    return project.memo("loader-criteria", build)


def soft_models(project):
    def build(_):
        classes = project_classes(project)
        targets = loader_targets(project)
        found = {}
        for name, (cls, context) in classes.items():
            chain = lineage(cls, context, classes)
            fields, kinds = {}, set()
            for member, member_context in chain:
                for field, kind in own_fields(member, member_context).items():
                    fields[field] = kind
                    kinds.add(kind)
            if len(kinds) != 1:
                continue
            kind = kinds.pop()
            names = {member.name for member, _ in chain}
            if kind == "django" and objects_state(chain, classes) != "plain":
                continue
            if kind == "sqlalchemy" and names & targets:
                continue
            found[name] = SoftModel(name, frozenset(fields), kind)
        return found

    return project.memo("soft-models", build)
