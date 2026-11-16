from kinds.index import functions_of, io_scope
from related_writes.foreign import foreign_findings
from related_writes.races import race_findings
from related_writes.split import split_findings
from related_writes.units import transaction_blocks

GUARDED = True
RULE = "related-writes-without-transaction"
MIGRATIONS = "migrations"
FORMS = (foreign_findings, split_findings, race_findings)


def check(context):
    if context.tests or MIGRATIONS in context.path.split("/"):
        return []
    scope = io_scope(context)
    found = []
    for qualified, function in functions_of(context):
        blocks = transaction_blocks(function, scope)
        for form in FORMS:
            found.extend(form(function, qualified, scope, blocks, context))
    return found
