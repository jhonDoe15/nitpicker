import ast

from checks.common import dotted_name, finding, own_nodes
from effects.sites import outer_calls
from effects.tables import MESSAGE, WRITE
from smells.io_index import IoScope, chain_names, io_index, methods_and_functions

RULE = "dual-write-without-outbox"
ON_COMMIT = {"django.db.transaction.on_commit"}


def callback_sites(callback, scope):
    if isinstance(callback, ast.Lambda):
        calls = outer_calls(ast.walk(callback.body))
        return [(call, scope.effects(call)) for call in calls]
    names = chain_names(callback)
    text = ".".join(names) + "()"
    return [(callback, scope.callable_effects(callback, names, text))] if names else []


def function_sites(function, scope, context):
    sites = []
    for call in outer_calls(own_nodes(function)):
        if dotted_name(call.func, context.aliases) in ON_COMMIT and call.args:
            sites.extend(
                (node, effects, True)
                for node, effects in callback_sites(call.args[0], scope)
            )
        else:
            sites.append((call, scope.effects(call), False))
    return sites


def is_reported_below(effects):
    return (
        WRITE in effects
        and MESSAGE in effects
        and (len(effects[WRITE]) > 1 or len(effects[MESSAGE]) > 1)
    )


def pair_of(sites):
    kept = [site for site in sites if not is_reported_below(site[1])]
    writes = [site for site in kept if WRITE in site[1]]
    messages = [site for site in kept if MESSAGE in site[1]]
    for message in messages:
        for write in writes:
            if write[0] is not message[0]:
                return write, message
    return None


def check(context):
    if context.tests:
        return []
    scope = IoScope(context, io_index(context.project))
    found = []
    for qualified, _name, function in methods_and_functions(context.tree):
        pair = pair_of(function_sites(function, scope, context))
        if pair is None:
            continue
        (_, written, _), (node, sent, after_commit) = pair
        fields = [qualified, " > ".join(written[WRITE]), " > ".join(sent[MESSAGE])]
        subject = "|".join(fields + (["on-commit"] if after_commit else []))
        found.append(finding(context.path, RULE, subject, node))
    return found
