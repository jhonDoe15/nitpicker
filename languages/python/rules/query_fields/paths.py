from django_declarations.known import (
    KEYED_TYPES,
    LOOKUPS,
    is_closed,
    opaque_names,
)
from django_models.lookups import following_model

UNKNOWN = "unknown"
RELATION = "relation"


def lookups_only(rest):
    return all(part in LOOKUPS or part.isdigit() for part in rest)


def extra_problem(found, graph):
    if found.field is not None and found.field.type in KEYED_TYPES:
        return None
    following = following_model(found, graph)
    if lookups_only(found.rest):
        return None
    if following is None:
        return None
    named = found.rest[0] in opaque_names(following, graph)
    return None if named or not is_closed(following, graph) else UNKNOWN


def first_problem(found, graph):
    model = found.model
    if found.rest[0] in opaque_names(model, graph) or not is_closed(model, graph):
        return None
    return UNKNOWN


def ends_at_relation(found):
    if found.reverse is not None:
        return True
    return found.field is not None and found.field.relation is not None


def by_accessor_name(found, text):
    parts = text.split("__")
    last = found.field if found.field is not None else found.reverse
    chain = [*found.path, *([last] if last is not None else [])]
    return any(
        hasattr(item, "owner") and part == item.name != item.query_name
        for part, item in zip(parts, chain)
    )


def path_problem(model, text, attribute, tools):
    graph, resolve, annotated = tools
    if text.split("__")[0] in annotated:
        return None
    found = resolve(model, text)
    if by_accessor_name(found, text):
        return UNKNOWN
    if found.field is None and found.reverse is None:
        return first_problem(found, graph)
    if found.rest:
        return extra_problem(found, graph)
    if attribute == "search_fields" and ends_at_relation(found):
        return RELATION
    return None
