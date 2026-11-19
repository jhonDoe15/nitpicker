from sharing.cached import cached_findings
from sharing.receivers import receiver_findings


def check(context):
    if context.tests:
        return []
    return [*receiver_findings(context), *cached_findings(context)]
