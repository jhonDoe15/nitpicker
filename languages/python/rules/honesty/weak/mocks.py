from checks.common import dotted_name
from honesty.weak.forms import Form

CALLED = {"assert_called", "assert_awaited"}
WITH_ARGUMENTS = {
    "assert_called_with",
    "assert_called_once_with",
    "assert_any_call",
    "assert_awaited_with",
    "assert_awaited_once_with",
    "assert_any_await",
}
WILDCARDS = {"unittest.mock.ANY", "mock.ANY"}


def is_wildcard(node, aliases):
    return dotted_name(node, aliases) in WILDCARDS


def mock_form(call, aliases):
    method = call.func.attr
    if method in CALLED:
        return Form()
    if method not in WITH_ARGUMENTS:
        return None
    values = call.args + [keyword.value for keyword in call.keywords]
    if values and all(is_wildcard(value, aliases) for value in values):
        return Form()
    return None
