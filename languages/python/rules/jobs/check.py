from checks.common import finding
from jobs.isolation import outer_loops, unisolated_call
from jobs.scopes import job_kinds
from kinds.index import functions_of, io_scope
from kinds.names import call_text

GUARDED = True
RULE = "job-item-failure-stops-run"


def check(context):
    if context.tests:
        return []
    kinds = job_kinds(context)
    if not kinds:
        return []
    scope = io_scope(context)
    found = []
    for qualified, function in functions_of(context):
        kind = kinds.get(id(function))
        if kind is None:
            continue
        for loop in outer_loops(function, context.parents):
            call = unisolated_call(loop, scope, context)
            if call is not None:
                subject = f"{qualified}|{call_text(call)}|{kind}"
                found.append(finding(context.path, RULE, subject, call))
    return found
