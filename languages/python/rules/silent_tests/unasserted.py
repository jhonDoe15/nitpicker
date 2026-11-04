from checks.common import finding
from silent_tests.calls import is_exempt
from silent_tests.helpers import analyzed_cases, is_test_file

RULE = "test-without-assertion"


def check(context):
    if not is_test_file(context):
        return []
    return [
        finding(context.path, RULE, case.subject, case.function)
        for case in analyzed_cases(context)
        if not is_exempt(case.function) and not case.records
    ]
