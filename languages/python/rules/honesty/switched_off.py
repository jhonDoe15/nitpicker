import ast

from checks.common import dotted_name, finding
from honesty.skipped import (
    PYTEST_CALLS,
    REASON_KEYWORDS,
    SKIP_EXCEPTIONS,
    decorated_marks,
    has_text,
    keyword_value,
    marks_of_param,
    positional,
    pytest_mark_name,
    reason_given,
    unittest_name,
)
from silent_tests.calls import test_functions

RULE = "switched-off-test"
CONDITIONAL_UNITTEST = {"skipIf", "skipUnless"}
LITERAL_STRINGS = {"true", "false"}


def is_literal_condition(node):
    if not isinstance(node, ast.Constant):
        return False
    if isinstance(node.value, str):
        return node.value.strip().lower() in LITERAL_STRINGS
    return isinstance(node.value, (bool, int))


def is_constant(node, value):
    return isinstance(node, ast.Constant) and node.value is value


def condition_of(call):
    given = keyword_value(call, {"condition"})
    return given if given is not None else positional(call, 0)


def xfail_subject(call, strict_default):
    if is_constant(keyword_value(call, {"run"}), False):
        return "pytest.mark.xfail(run=False)"
    strict = keyword_value(call, {"strict"})
    if is_constant(strict, False) or (strict is None and not strict_default):
        return "pytest.mark.xfail"
    return None


def pytest_mark_subject(mark, node, dotted, strict_default):
    if not isinstance(node, ast.Call) or not reason_given(node, dotted):
        return None
    call = node
    if mark == "xfail":
        return xfail_subject(call, strict_default)
    if mark == "skip":
        return "pytest.mark.skip"
    if is_literal_condition(condition_of(call)):
        return "pytest.mark.skipif(literal)"
    return None


def unittest_subject(name, node, dotted):
    call = node if isinstance(node, ast.Call) else None
    if name == "expectedFailure" or call is None or not reason_given(node, dotted):
        return None
    if name == "skip":
        return "unittest.skip"
    if name in CONDITIONAL_UNITTEST and is_literal_condition(positional(call, 0)):
        return f"unittest.{name}(literal)"
    return None


def mark_subject(node, context):
    target = node.func if isinstance(node, ast.Call) else node
    dotted = dotted_name(target, context.aliases) or ""
    mark = pytest_mark_name(dotted)
    if mark is not None:
        return pytest_mark_subject(mark, node, dotted, strict_xfail(context))
    name = unittest_name(dotted)
    return None if name is None else unittest_subject(name, node, dotted)


def strict_xfail(context):
    return bool(context.options.get("xfailStrict"))


def has_message(call):
    given = [positional(call, 0), keyword_value(call, REASON_KEYWORDS)]
    return any(g is not None and has_text(g) for g in given)


def statement_subject(statement, aliases):
    if isinstance(statement, ast.Raise) and statement.exc is not None:
        exception = statement.exc
        target = exception.func if isinstance(exception, ast.Call) else exception
        name = dotted_name(target, aliases) or ""
        given = positional(exception, 0) if isinstance(exception, ast.Call) else None
        named = name.rsplit(".", 1)[-1] in SKIP_EXCEPTIONS
        return "SkipTest" if named and given is not None and has_text(given) else None
    call = statement.value if isinstance(statement, ast.Expr) else None
    if not isinstance(call, ast.Call) or not has_message(call):
        return None
    name = dotted_name(call.func, aliases)
    if name in PYTEST_CALLS:
        return f"{name}()"
    is_method = isinstance(call.func, ast.Attribute) and call.func.attr == "skipTest"
    return "skipTest()" if is_method else None


def body_findings(owner, context):
    found = []
    for statement in owner.body:
        subject = statement_subject(statement, context.aliases)
        if subject:
            found.append(finding(context.path, RULE, subject, statement))
    return found


def mark_findings(context):
    found = []
    for node in ast.walk(context.tree):
        marks = list(decorated_marks(node))
        if isinstance(node, ast.Call):
            marks += marks_of_param(node, context.aliases)
        for mark in marks:
            subject = mark_subject(mark, context)
            if subject:
                found.append(finding(context.path, RULE, subject, mark))
    return found


def check(context):
    if not context.tests:
        return []
    found = mark_findings(context)
    found.extend(body_findings(context.tree, context))
    for _, function in test_functions(context.tree):
        found.extend(body_findings(function, context))
    return found
