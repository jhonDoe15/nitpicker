from checks.common import finding
from dataloader_batches.loaders import batch_functions
from dataloader_batches.returns import problems_in

GUARDED = True
RULE = "dataloader-batch-result"


def subject_of(batch, kind, detail):
    owner = batch.name if batch.owner == batch.name else f"{batch.owner}.{batch.name}"
    return f"{owner}|{kind}|{detail}"


def check(context):
    if context.tests:
        return []
    found, seen = [], set()
    for batch in batch_functions(context):
        for kind, detail, node in problems_in(batch):
            if id(node) not in seen:
                seen.add(id(node))
                subject = subject_of(batch, kind, detail)
                found.append(finding(context.path, RULE, subject, node))
    return found
