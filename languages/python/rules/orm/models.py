import ast
from collections import namedtuple

from checks.common import dotted_name
from security.resolve.scopes import MAX_HOPS, definition, module_where

Relation = namedtuple("Relation", "name target manager lazy reverse")
DJANGO_FIELDS = {
    "ForeignKey": (False, True),
    "OneToOneField": (False, False),
    "ManyToManyField": (True, True),
}
DJANGO_MODEL = "django.db.models.Model"
SQLALCHEMY_RELATIONSHIPS = {"relationship", "Relationship"}
SQLALCHEMY_ROOTS = ("sqlalchemy", "sqlmodel", "flask_sqlalchemy")


def class_assignments(cls):
    for statement in cls.body:
        if isinstance(statement, ast.Assign) and len(statement.targets) == 1:
            target, value = statement.targets[0], statement.value
        elif isinstance(statement, ast.AnnAssign) and statement.value is not None:
            target, value = statement.target, statement.value
        else:
            continue
        if isinstance(target, ast.Name):
            yield target.id, value


def keyword(call, name):
    return next((k.value for k in call.keywords if k.arg == name), None)


def constant(node):
    return node.value if isinstance(node, ast.Constant) else None


def target_name(node, owner):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        name = node.value.rsplit(".", 1)[-1]
        return owner if name == "self" else name
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def relation_target(call, owner):
    node = call.args[0] if call.args else keyword(call, "to")
    return target_name(node, owner) if node is not None else None


def is_django_model(cls, context, hops=0):
    if hops > MAX_HOPS:
        return False
    for base in cls.bases:
        if dotted_name(base, context.aliases) == DJANGO_MODEL:
            return True
        found = definition(base, module_where(context))
        if found is not None and found[0] is not cls:
            if is_django_model(found[0], found[1].context, hops + 1):
                return True
    return False


def django_fields(cls, context):
    for name, call in class_assignments(cls):
        if not isinstance(call, ast.Call):
            continue
        dotted = dotted_name(call.func, context.aliases) or ""
        shape = DJANGO_FIELDS.get(dotted.rsplit(".", 1)[-1])
        target = relation_target(call, cls.name)
        if shape is not None and dotted.startswith("django") and target:
            yield name, call, shape, target


def reverse_name(owner, manager, call):
    related = constant(keyword(call, "related_name"))
    if related is not None:
        hidden = not isinstance(related, str) or related.endswith("+") or "%" in related
        return None if hidden else related
    return f"{owner.lower()}_set" if manager else owner.lower()


def imports_sqlalchemy(context):
    return any(
        value.startswith(SQLALCHEMY_ROOTS)
        for table in context.aliases[:2]
        for value in table.values()
    )


def lazy_strategy(call):
    lazy = constant(keyword(call, "lazy"))
    options = keyword(call, "sa_relationship_kwargs")
    if isinstance(options, ast.Dict):
        for key, value in zip(options.keys, options.values):
            if constant(key) == "lazy":
                lazy = constant(value)
    return lazy is None or lazy is True or lazy == "select"


def backref_of(call):
    node = keyword(call, "backref")
    if isinstance(node, ast.Call) and node.args:
        return constant(node.args[0]), lazy_strategy(node)
    name = constant(node)
    return (name, True) if isinstance(name, str) else (None, False)


def sqlalchemy_fields(cls, context):
    if not imports_sqlalchemy(context):
        return
    for name, call in class_assignments(cls):
        if not isinstance(call, ast.Call):
            continue
        last = (dotted_name(call.func, context.aliases) or "").rsplit(".", 1)[-1]
        target = relation_target(call, cls.name)
        if last in SQLALCHEMY_RELATIONSHIPS:
            yield name, call, target


def collect_class(cls, context, own, reverse):
    key = (context.path, cls.name)
    if is_django_model(cls, context):
        relations = {}
        for name, call, (manager, reverse_manager), target in django_fields(
            cls, context
        ):
            relations[name] = Relation(name, target, manager, True, False)
            backward = reverse_name(cls.name, reverse_manager, call)
            if backward:
                relation = Relation(backward, cls.name, reverse_manager, True, True)
                reverse.setdefault(target, []).append(("django", relation))
        own[key] = ("django", relations)
        return
    relations = {}
    for name, call, target in sqlalchemy_fields(cls, context):
        relations[name] = Relation(name, target, False, lazy_strategy(call), False)
        backward, lazy = backref_of(call)
        if backward and target:
            relation = Relation(backward, cls.name, False, lazy, True)
            reverse.setdefault(target, []).append(("sqlalchemy", relation))
    if relations:
        own[key] = ("sqlalchemy", relations)


def project_relations(project):
    def build(_):
        own, reverse = {}, {}
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if isinstance(node, ast.ClassDef):
                    collect_class(node, context, own, reverse)
        return own, reverse

    return project.memo("orm-relations", build)


def relations_of(cls, context, hops=0):
    own, reverse = project_relations(context.project)
    orm, found = own.get((context.path, cls.name), (None, {}))
    found = dict(found)
    for kind, relation in reverse.get(cls.name, []):
        orm = orm or kind
        found.setdefault(relation.name, relation)
    if hops <= MAX_HOPS:
        for base in cls.bases:
            resolved = definition(base, module_where(context))
            if resolved is not None and resolved[0] is not cls:
                base_orm, inherited = relations_of(
                    resolved[0], resolved[1].context, hops + 1
                )
                orm = orm or base_orm
                for name, relation in inherited.items():
                    found.setdefault(name, relation)
    return orm, found
