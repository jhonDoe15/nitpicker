from checks.common import finding, walk_statements
from effect_kinds.tables import DATABASE, REMOTE
from resolver_queries.parents import list_parents
from resolver_queries.resolvers import resolvers_in
from kinds.index import io_scope
from kinds.names import chain_names
from kinds.sites import outer_calls

GUARDED = True
RULE = "resolver-query-per-parent"
KINDS = (DATABASE, REMOTE)
LOADER_METHODS = {"load", "load_many", "prime", "clear"}
CACHE_WORDS = ("loader", "cache", "memo")


def is_batched(call):
    names = chain_names(call.func)
    owners = [name.lower() for name in names[:-1]]
    if (
        names
        and names[-1] in LOADER_METHODS
        and any("loader" in name for name in owners)
    ):
        return True
    return any(word in name for name in owners for word in CACHE_WORDS)


def first_query(function, scope):
    for call in outer_calls(walk_statements(function.body)):
        effects = scope.effects(call)
        kind = next((item for item in KINDS if item in effects), None)
        if kind is not None and not is_batched(call):
            return call, kind, effects[kind]
    return None


def check(context):
    if context.tests:
        return []
    parents = list_parents(context.project)
    scope = io_scope(context)
    found = []
    for resolver in resolvers_in(context):
        if resolver.parent not in parents:
            continue
        query = first_query(resolver.function, scope)
        if query is not None:
            call, kind, path = query
            route = " > ".join(path)
            subject = (
                f"{resolver.parent}.{resolver.name}|{resolver.framework}|{kind}|{route}"
            )
            found.append(finding(context.path, RULE, subject, call))
    return found
