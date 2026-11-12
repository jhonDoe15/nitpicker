from checks.common import finding
from honesty.round_trips.pairs import round_trip_pairs
from honesty.round_trips.seen import tested_names

RULE = "untested-round-trip"


def is_tested(tests, first, second):
    return any(first in names and second in names for names in tests)


def subject_of(owner, first, second):
    prefix = f"{owner}." if owner else ""
    return f"{prefix}{first.name} and {prefix}{second.name}"


def check(context):
    if context.tests:
        return []
    tests = context.project.memo("round-trip-tests", tested_names)
    findings = []
    for owner, first, second in round_trip_pairs(context.tree):
        if is_tested(tests, first.name, second.name):
            continue
        later = max((first, second), key=lambda node: node.lineno)
        earlier = second if later is first else first
        subject = subject_of(owner, earlier, later)
        findings.append(finding(context.path, RULE, subject, later))
    return findings
