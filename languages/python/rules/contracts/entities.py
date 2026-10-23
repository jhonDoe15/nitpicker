import ast

from checks.common import dotted_name
from contracts.infrastructure import located_key, parsed_string

PASSES = 4
DECLARATIVE_BASES = {
    "sqlalchemy.orm.DeclarativeBase": "SQLAlchemy",
    "sqlalchemy.orm.DeclarativeBaseNoMeta": "SQLAlchemy",
}
BASE_FACTORIES = {
    "sqlalchemy.orm.declarative_base": "SQLAlchemy",
    "sqlalchemy.ext.declarative.declarative_base": "SQLAlchemy",
}
MODEL_BASES = {
    "django.db.models.Model": "Django",
    "django.db.models.base.Model": "Django",
    "tortoise.models.Model": "Tortoise",
    "tortoise.Model": "Tortoise",
    "peewee.Model": "peewee",
}
SQLMODEL = "sqlmodel.SQLModel"
TABLE_ATTRIBUTES = {"__tablename__", "__table__"}


def assigned_bases(context):
    for node in context.tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
            orm = BASE_FACTORIES.get(dotted_name(node.value.func, context.aliases))
            targets = [t.id for t in node.targets if isinstance(t, ast.Name)]
            yield from ((target, orm) for target in targets if orm)


def declares_table(node):
    for statement in node.body:
        targets = getattr(statement, "targets", [getattr(statement, "target", None)])
        if any(getattr(target, "id", None) in TABLE_ATTRIBUTES for target in targets):
            return True
    return False


def is_table_model(node):
    return any(
        keyword.arg == "table"
        and isinstance(keyword.value, ast.Constant)
        and keyword.value.value is True
        for keyword in node.keywords
    )


def is_abstract(node):
    for statement in node.body:
        if isinstance(statement, ast.ClassDef) and statement.name == "Meta":
            return "abstract = True" in ast.unparse(statement)
    return False


def base_kind(base, context, known):
    name = dotted_name(base, context.aliases) or ""
    if name in DECLARATIVE_BASES:
        return "base", DECLARATIVE_BASES[name]
    if name in MODEL_BASES:
        return "model", MODEL_BASES[name]
    if name == SQLMODEL:
        return "sqlmodel", "SQLModel"
    return known.get(located_key(name, context))


def derived_kind(node, kind, orm):
    if kind == "sqlmodel":
        return "entity" if is_table_model(node) else "sqlmodel"
    if kind == "entity":
        return "entity"
    if orm == "SQLAlchemy":
        return "entity" if declares_table(node) else "base"
    return "base" if is_abstract(node) else "entity"


def class_kind(node, context, known):
    for base in node.bases:
        found = base_kind(base, context, known)
        if found is not None:
            return derived_kind(node, *found), found[1]
    return None


def add_classes(path, context, known):
    for name, orm in assigned_bases(context):
        known.setdefault((path, name), ("base", orm))
    for node in ast.walk(context.tree):
        if isinstance(node, ast.ClassDef) and (path, node.name) not in known:
            found = class_kind(node, context, known)
            if found is not None:
                known[(path, node.name)] = found


def orm_classes(project):
    def build(_):
        known = {}
        for _ in range(PASSES):
            for path, context in project.contexts.items():
                add_classes(path, context, known)
        return known

    return project.memo("orm-classes", build)


def entity_of(node, context, known):
    name = dotted_name(node, context.aliases) or ""
    found = known.get(located_key(name, context))
    return (name, found[1]) if found and found[0] == "entity" else None


def entity_named(node, context):
    key = located_key(dotted_name(node, context.aliases) or "", context)
    found = orm_classes(context.project).get(key)
    return (key[1], found[1]) if found and found[0] == "entity" else None


def entities_in(expression, context):
    known = orm_classes(context.project)
    found = []
    for node in ast.walk(expression):
        if isinstance(node, (ast.Name, ast.Attribute)):
            found.append(entity_of(node, context, known))
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            parsed = parsed_string(node.value)
            found.extend(entities_in(parsed, context) if parsed else [])
    return list(dict.fromkeys(item for item in found if item))
