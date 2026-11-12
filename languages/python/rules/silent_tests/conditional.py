import ast

from checks.common import finding
from silent_tests.body import ASSERT
from silent_tests.calls import is_unittest_class
from silent_tests.helpers import analyzed_cases, is_test_file

RULE = "conditional-assertion-in-test"


def reads_caught_name(node, caught):
    return isinstance(node, ast.Assert) and any(
        isinstance(part, ast.Name) and part.id in caught for part in ast.walk(node)
    )


def conditional_checks(records):
    first = {}
    for kind, construct, outer, node, caught in records:
        if kind != ASSERT or construct is None or reads_caught_name(node, caught):
            continue
        first.setdefault(id(outer), (construct, node))
    return sorted(first.values(), key=lambda item: item[1].lineno)


def check(context):
    if not is_test_file(context):
        return []
    found = []
    for case in analyzed_cases(context):
        suffix = " (unittest)" if is_unittest_class(case.owner) else ""
        found.extend(
            finding(context.path, RULE, f"{case.subject}: {construct}{suffix}", node)
            for construct, node in conditional_checks(case.records)
        )
    return found
