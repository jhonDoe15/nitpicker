from django_declarations.known import is_closed, is_many, opaque_names
from django_models.lookups import following_model, resolver

NOT_A_FIELD = "not a field"
RELATED = "related manager"
ID_SUFFIX = "_id"


def plain_attributes(model, graph):
    return opaque_names(model, graph) - model.generic - model.properties


def unknown_member(found, graph):
    model = found.model
    name = found.rest[0]
    if name in model.properties | model.generic:
        return True
    return is_closed(model, graph) and name not in plain_attributes(model, graph)


def partial_problem(found, graph):
    following = following_model(found, graph)
    if following is None or not is_closed(following, graph):
        return None
    name = found.rest[0]
    if name in plain_attributes(following, graph):
        return None
    return NOT_A_FIELD


def attname_text(text):
    return "__".join(
        part[: -len(ID_SUFFIX)] if part.endswith(ID_SUFFIX) else part
        for part in text.split("__")
    )


def accessor_problem(model, text, graph, project):
    problem = plain_problem(model, text, graph, project)
    if problem is not None and attname_text(text) != text:
        return plain_problem(model, attname_text(text), graph, project)
    return problem


def plain_problem(model, text, graph, project):
    found = resolver(project)(model, text)
    if found.field is None and found.reverse is None:
        return NOT_A_FIELD if unknown_member(found, graph) else None
    if found.rest:
        return partial_problem(found, graph)
    last = found.field if found.field is not None else found.reverse
    return RELATED if is_many(last) else None
