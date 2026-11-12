from checks.common import finding
from persistence.joins.loaders import JOINED, loader_paths, option_sets
from persistence.joins.mapped import COLLECTION, relation_in

RULE = "multiple-collection-joins"
GUARDED = True


def joined_groups(paths, root, context):
    groups = {}
    for path in paths:
        root_name = path[0].owner or root or ""
        names, target, owner = [root_name], root, context
        group = ()
        for segment in path:
            where = context if segment.owner else owner
            relation, place = relation_in(where, segment.owner or target, segment.name)
            if relation is None:
                break
            names.append(segment.name)
            if segment.strategy in JOINED:
                joined = groups.setdefault(group, {})
                joined.setdefault(tuple(names), (relation.kind == COLLECTION, segment.node))
            else:
                group = tuple(names)
            target, owner = relation.target, place
    return groups


def nested(outer, inner):
    return inner[: len(outer)] == outer


def crossed(joined):
    collections = [key for key, (many, _) in joined.items() if many]
    for index, first in enumerate(collections):
        for second in collections[index + 1 :]:
            if not nested(first, second) and not nested(second, first):
                return first, second
    return None


def described(key):
    return ".".join(part for part in key if part)


def check(context):
    if context.tests:
        return []
    found = []
    for loaders, root in option_sets(context):
        groups = joined_groups(loader_paths(loaders, context), root, context)
        for joined in groups.values():
            pair = crossed(joined)
            if pair is not None:
                first, second = pair
                subject = f"{described(first)} {described(second)}"
                found.append(finding(context.path, RULE, subject, joined[second][1]))
                break
    return found
