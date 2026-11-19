import ast
from collections import namedtuple

from django_models.fields import Field, Relation, declared_fields, implicit_key
from django_models.members import generic_foreign_keys, managers_of, property_names
from django_models.meta import meta_facts
from checks.common import dotted_name
from orm.models import DJANGO_MODEL, is_django_model
from security.resolve.scopes import MAX_HOPS, definition, module_where

Model = namedtuple(
    "Model",
    "key name node context abstract fields owned uniques properties generic managers bases is_model complete",
)
Reverse = namedtuple("Reverse", "name query_name owner relation many")
Graph = namedtuple("Graph", "by_key by_name reverse")


def base_classes(cls, context):
    found = []
    for base in cls.bases:
        resolved = definition(base, module_where(context))
        if resolved is not None and resolved[0] is not cls:
            found.append(resolved)
    return found


def parent_pointer(parent):
    name = f"{parent.name.lower()}_ptr"
    relation = Relation(name, "OneToOneField", parent.name, None, None, False)
    return Field(
        name, "OneToOneField", None, False, False, True, True, True, None, relation
    )


def merged(parents, own, attribute):
    result = {}
    for parent in parents:
        result.update(getattr(parent, attribute))
    result.update(own)
    return result


def parents_of(cls, context, built, hops):
    parents = []
    for node, where in base_classes(cls, context):
        parent = (
            build_model(node, where.context, built, hops + 1)
            if hops <= MAX_HOPS
            else None
        )
        if parent is not None:
            parents.append(parent)
    return parents


def inherited_fields(parents):
    fields = {}
    for parent in parents:
        for name, field in parent.fields.items():
            demoted = not parent.abstract and parent.is_model and field.primary_key
            fields[name] = field._replace(primary_key=False) if demoted else field
    return fields


def all_fields(parents, own):
    fields = {**inherited_fields(parents), **own}
    for parent in parents:
        if not parent.abstract and parent.is_model:
            pointer = parent_pointer(parent)
            fields.setdefault(pointer.name, pointer)
    if not any(field.primary_key for field in fields.values()):
        fields["id"] = implicit_key()
    return fields


def owned_names(parents, own, fields):
    names = set(own) | {n for n, f in fields.items() if f.node is None and f.relation}
    for parent in parents:
        if parent.abstract:
            names |= parent.owned
    return names


def bases_known(cls, context):
    resolved = len(base_classes(cls, context))
    plain = sum(dotted_name(b, context.aliases) == DJANGO_MODEL for b in cls.bases)
    return resolved + plain == len(cls.bases)


def build_model(cls, context, built, hops=0):
    key = (context.path, cls.name)
    if key in built:
        return built[key]
    built[key] = None
    parents = parents_of(cls, context, built, hops)
    abstract, uniques, opaque = meta_facts(cls, context)
    inherited = [item for parent in parents for item in parent.uniques]
    own = declared_fields(cls, context)
    fields = all_fields(parents, own)
    model = Model(
        key,
        cls.name,
        cls,
        context,
        abstract,
        fields,
        owned_names(parents, own, fields),
        inherited + uniques,
        set().union(*(p.properties for p in parents), property_names(cls, context)),
        set().union(*(p.generic for p in parents), generic_foreign_keys(cls, context)),
        merged(parents, managers_of(cls, context), "managers"),
        [parent.key for parent in parents],
        is_django_model(cls, context),
        not opaque and bases_known(cls, context) and all(p.complete for p in parents),
    )
    built[key] = model
    return model


def classes_of(project):
    for context in project.contexts.values():
        for node in ast.walk(context.tree):
            if isinstance(node, ast.ClassDef) and is_django_model(node, context):
                yield node, context


def target_key(model, relation, by_name):
    candidates = by_name.get(relation.target, [])
    local = [item for item in candidates if item.context.path == model.context.path]
    chosen = local or candidates
    return chosen[0].key if len(chosen) == 1 else None


def build_graph(project):
    built = {}
    for node, context in classes_of(project):
        build_model(node, context, built)
    by_key = {key: m for key, m in built.items() if m is not None and m.is_model}
    by_name = {}
    for model in by_key.values():
        by_name.setdefault(model.name, []).append(model)
    reverse = {}
    for model in by_key.values():
        if model.abstract:
            continue
        for field in (
            model.fields[name] for name in model.owned if name in model.fields
        ):
            key = target_key(model, field.relation, by_name) if field.relation else None
            hidden = field.relation and (field.relation.related_name or "").endswith(
                "+"
            )
            if key is not None and not hidden:
                reverse.setdefault(key, []).append(reverse_of(model, field.relation))
    return Graph(by_key, by_name, reverse)


def reverse_of(model, relation):
    many = relation.kind != "OneToOneField"
    default = f"{model.name.lower()}_set" if many else model.name.lower()
    name = relation.related_name or default
    query = relation.query_name or relation.related_name or model.name.lower()
    return Reverse(name, query, model, relation, many)


def project_graph(project):
    return project.memo("django-model-graph", lambda _: build_graph(project))
