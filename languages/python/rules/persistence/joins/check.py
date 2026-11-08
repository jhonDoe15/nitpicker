from checks.common import finding
from persistence.joins.loaders import JOINED, loader_paths, option_sets
from persistence.joins.mapped import COLLECTION, relation_in

RULE = "multiple-collection-joins"
GUARDED = True


def joined_groups(paths, root, context):
    groups = {}
    for path in paths:
        names, group, target, owner = [], (), root, context
        root_name = path[0].owner or root
        for segment in path:
            where = context if segment.owner else owner
            relation, place = relation_in(where, segment.owner or target, segment.name)
            if relation is None:
                break
            names.append(segment.name)
            if segment.strategy in JOINED:
                joined = groups.setdefault(group, {})
                joined.setdefault(tuple(names), (relation.kind == COLLECTION, segment.node, root_name))
            else:
                group = tuple(names)
            target, owner = relation.target, place
    return groups


def nested(outer, inner):
    return inner[: len(outer)] == outer


def crossed(joined):
    collections = [key for key, (many, _, _) in joined.items() if many]
    for index, first in enumerate(collections):
        for second in collections[index + 1 :]:
            if not nested(first, second) and not nested(second, first):
                return first, second
    return None


def described(key, joined):
    root = joined[key][2]
    return ".".join([root, *key]) if root else ".".join(key)


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
                subject = f"{described(first, joined)} {described(second, joined)}"
                found.append(finding(context.path, RULE, subject, joined[second][1]))
                break
    return found
