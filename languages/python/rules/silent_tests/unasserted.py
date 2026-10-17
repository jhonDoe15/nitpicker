from checks.common import finding
from silent_tests.calls import unasserted_tests
from silent_tests.helpers import assertion_helpers, is_test_file

RULE = "test-without-assertion"


def check(context):
    if not is_test_file(context):
        return []
    helpers = assertion_helpers(context.project)
    return [
        finding(context.path, RULE, subject, function)
        for subject, function in unasserted_tests(context.tree, context.aliases, helpers)
    ]
