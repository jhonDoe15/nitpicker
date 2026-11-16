from checks.common import finding
from soft_delete.majority import unfiltered_reads

GUARDED = True
RULE = "soft-delete-filter-missing"


def check(context):
    if context.tests:
        return []
    found = []
    for read, majority in unfiltered_reads(context):
        subject = (
            f"{read.function}|{read.model}|{read.field}|{majority.via}"
            f"|{majority.filtered} of {majority.total}"
        )
        found.append(finding(context.path, RULE, subject, read.node))
    return found
