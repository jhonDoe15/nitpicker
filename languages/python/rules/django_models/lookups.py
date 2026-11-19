from collections import namedtuple

from django_models.graph import project_graph, target_key

Lookup = namedtuple("Lookup", "model path field reverse rest")
PK = "pk"


def forward_target(model, relation, graph):
    key = target_key(model, relation, graph.by_name)
    return graph.by_key.get(key) if key else None


def following_model(found, graph):
    if found.reverse is not None:
        return found.reverse.owner
    relation = found.field.relation if found.field is not None else None
    return forward_target(found.model, relation, graph) if relation else None


def named_member(model, part, graph):
    if part == PK:
        field = next((f for f in model.fields.values() if f.primary_key), None)
        return (field, None) if field is not None else (None, None)
    field = model.fields.get(part)
    if field is not None:
        return field, None
    for item in graph.reverse.get(model.key, []):
        if part in (item.query_name, item.name):
            return None, item
    return None, None


def next_model(model, field, reverse, graph):
    if reverse is not None:
        return reverse.owner
    if field.relation is not None:
        return forward_target(model, field.relation, graph)
    return None


def resolve_lookup(model, text, graph):
    parts = text.split("__")
    path, current = [], model
    for index, part in enumerate(parts):
        field, reverse = named_member(current, part, graph)
        rest = tuple(parts[index + 1 :])
        if field is None and reverse is None:
            return Lookup(current, tuple(path), None, None, tuple(parts[index:]))
        following = next_model(current, field, reverse, graph)
        probe = named_member(following, rest[0], graph) if following and rest else None
        if probe is None or probe == (None, None):
            return Lookup(current, tuple(path), field, reverse, rest)
        path.append(field or reverse)
        current = following
    return Lookup(current, tuple(path), None, None, ())


def resolver(project):
    graph = project_graph(project)
    return lambda model, text: resolve_lookup(model, text, graph)
