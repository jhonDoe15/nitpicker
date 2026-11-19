from django_models.lookups import resolver


def chain_of(found):
    last = found.field if found.field is not None else found.reverse
    return [*found.path, last]


def resolved_chain(model, text, project):
    found = resolver(project)(model, text)
    if found.rest or (found.field is None and found.reverse is None):
        return None
    return chain_of(found)


def may_be_none(item):
    if hasattr(item, "owner"):
        return not item.many
    many = item.relation is not None and item.relation.many
    return item.null and not many
