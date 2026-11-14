import ast
from collections import namedtuple

from checks.common import dotted_name, finding, walk_statements, words_of
from dual_write.branches import in_exclusive_arms
from dual_write.relays import relay_sites
from effect_kinds.tables import MESSAGE, WRITE
from kinds.index import functions_of, io_scope
from kinds.names import call_text, chain_names
from kinds.sites import outer_calls
from transactions.scopes import transaction_label

GUARDED = True
RULE = "dual-write-without-outbox"
ON_COMMIT = {"django.db.transaction.on_commit"}
Site = namedtuple("Site", "node effects after_commit")


def callback_sites(callback, scope):
    if isinstance(callback, ast.Lambda):
        calls = outer_calls(ast.walk(callback.body))
        return [Site(call, scope.effects(call), True) for call in calls]
    names = chain_names(callback)
    if not names:
        return []
    effects = scope.callable_effects(callback, names, call_text(callback))
    return [Site(callback, effects, True)]


def function_sites(function, scope, context):
    sites = []
    for call in outer_calls(walk_statements(function.body)):
        if dotted_name(call.func, context.aliases) in ON_COMMIT and call.args:
            sites.extend(callback_sites(call.args[0], scope))
        else:
            sites.append(Site(call, scope.effects(call), False))
    return sites


def is_reported_below(effects):
    return (
        WRITE in effects
        and MESSAGE in effects
        and (len(effects[WRITE]) > 1 or len(effects[MESSAGE]) > 1)
    )


def transaction_blocks(function, scope):
    return [
        node
        for node in walk_statements(function.body)
        if isinstance(node, (ast.With, ast.AsyncWith))
        and any(transaction_label(i.context_expr, scope) for i in node.items)
    ]


def spans(block, node):
    start = (block.lineno, block.col_offset)
    end = (block.end_lineno, block.end_col_offset)
    return start <= (node.lineno, node.col_offset) <= end


def committed_before(write, message, blocks):
    return any(
        spans(block, write.node)
        and not spans(block, message.node)
        and (message.node.lineno, message.node.col_offset)
        > (block.end_lineno, block.end_col_offset)
        for block in blocks
    )


def is_outbox(site):
    return any(
        "outbox" in words_of(name)
        for node in ast.walk(site.node)
        for name in names_in(node)
    )


def names_in(node):
    if isinstance(node, ast.Name):
        return [node.id]
    if isinstance(node, ast.Attribute):
        return [node.attr]
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return [node.value]
    return []


def pair_of(sites, exempt, parents):
    kept = [
        site
        for site in sites
        if not is_reported_below(site.effects) and id(site.node) not in exempt
    ]
    writes = [site for site in kept if WRITE in site.effects and not is_outbox(site)]
    messages = [site for site in kept if MESSAGE in site.effects and not is_outbox(site)]
    for message in messages:
        for write in writes:
            if write.node is not message.node and not in_exclusive_arms(
                write.node, message.node, parents
            ):
                return write, message
    return None


def check(context):
    if context.tests:
        return []
    scope = io_scope(context)
    found = []
    for qualified, function in functions_of(context):
        sites = function_sites(function, scope, context)
        pair = pair_of(sites, relay_sites(sites, function, scope), context.parents)
        if pair is None:
            continue
        written, sent = pair
        blocks = transaction_blocks(function, scope)
        after = sent.after_commit or committed_before(written, sent, blocks)
        fields = [
            qualified,
            " > ".join(written.effects[WRITE]),
            " > ".join(sent.effects[MESSAGE]),
        ]
        subject = "|".join(fields + (["on-commit"] if after else []))
        found.append(finding(context.path, RULE, subject, sent.node))
    return found
