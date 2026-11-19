from checks.common import finding
from soft_delete.learned.findings import learned_findings
from soft_delete.majority import unfiltered_reads

GUARDED = True
RULE = "soft-delete-filter-missing"


def check(context):
    if context.tests:
        return []
    found, seen = [], set()
    for read, majority in unfiltered_reads(context):
        subject = (
            f"{read.function}|{read.model}|{read.field}|{majority.via}"
            f"|{majority.filtered} of {majority.total}"
        )
        seen.add(id(read.node))
        found.append(finding(context.path, RULE, subject, read.node))
    for node, subject in learned_findings(context):
        if id(node) not in seen:
            found.append(finding(context.path, RULE, subject, node))
    return found
