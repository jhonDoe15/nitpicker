import ast

from checks.common import dotted_name, finding
from honesty.skipped import (
    PYTEST_CALLS,
    REASON_KEYWORDS,
    SKIP_EXCEPTIONS,
    has_text,
    keyword_value,
    positional,
    pytest_mark_name,
    reason_given,
    unittest_name,
)
from honesty.switches.marks import expand, imperative, mark_sites
from honesty.switches.placement import skip_scopes, unconditional
from syntax.folding import UNKNOWN, Folder, module_constants

RULE = "switched-off-test"
CONDITIONAL_UNITTEST = {"skipIf", "skipUnless"}


def is_constant(node, value):
    return isinstance(node, ast.Constant) and node.value is value


def condition_of(call):
    given = keyword_value(call, {"condition"})
    return given if given is not None else positional(call, 0)


def is_non_strict(call, folder, strict_default):
    node = keyword_value(call, {"strict"})
    value = None if node is None else folder.fold(node)
    if value is UNKNOWN:
        return False
    return not strict_default if value is None else not value


def xfail_subject(call, folder, strict_default):
    if is_constant(keyword_value(call, {"run"}), False):
        return "pytest.mark.xfail(run=False)"
    return "pytest.mark.xfail" if is_non_strict(call, folder, strict_default) else None


def pytest_mark_subject(mark, call, state):
    if mark == "xfail":
        return xfail_subject(call, *state)
    if mark == "skip":
        return "pytest.mark.skip"
    if state[0].is_literal(condition_of(call)):
        return "pytest.mark.skipif(literal)"
    return None


def unittest_subject(name, call, folder):
    if name == "skip":
        return "unittest.skip"
    if name in CONDITIONAL_UNITTEST and folder.is_literal(positional(call, 0)):
        return f"unittest.{name}(literal)"
    return None


def mark_subject(expression, context, state):
    if not isinstance(expression, ast.Call):
        return None
    dotted = dotted_name(expression.func, context.aliases) or ""
    mark = pytest_mark_name(dotted)
    name = unittest_name(dotted)
    if mark is None and (name is None or name == "expectedFailure"):
        return None
    if not reason_given(expression, dotted):
        return None
    if mark is not None:
        return pytest_mark_subject(mark, expression, state)
    return unittest_subject(name, expression, state[0])


def has_message(call):
    given = [positional(call, 0), keyword_value(call, REASON_KEYWORDS)]
    return any(g is not None and has_text(g) for g in given)


def raise_subject(statement, aliases):
    exception = statement.exc
    if exception is None:
        return None
    call = exception if isinstance(exception, ast.Call) else None
    name = dotted_name(call.func if call else exception, aliases) or ""
    given = positional(call, 0) if call else None
    named = name.rsplit(".", 1)[-1] in SKIP_EXCEPTIONS
    return "SkipTest" if named and given is not None and has_text(given) else None


def call_subjects(call, context, state):
    name = dotted_name(call.func, context.aliases)
    if name in PYTEST_CALLS:
        return [f"{name}()"] if has_message(call) else []
    if isinstance(call.func, ast.Attribute) and call.func.attr == "skipTest":
        return ["skipTest()"] if has_message(call) else []
    names = module_constants(context.tree)
    subjects = []
    for argument in imperative(call):
        for expression, _ in expand(argument, names):
            subjects.append(mark_subject(expression, context, state))
    return [subject for subject in subjects if subject]


def statement_subjects(statement, context, state):
    if isinstance(statement, ast.Raise):
        subject = raise_subject(statement, context.aliases)
        return [subject] if subject else []
    if isinstance(statement.value, ast.Call):
        return call_subjects(statement.value, context, state)
    return []


def minimum_python(context):
    given = context.options.get("minimumPython")
    return tuple(given) if given else None


def check(context):
    if not context.tests:
        return []
    folder = Folder(context.tree, context.aliases, minimum_python(context))
    state = (folder, bool(context.options.get("xfailStrict")))
    found = []
    for site in mark_sites(context):
        if site.call is None:
            subject = mark_subject(site.expression, context, state)
            if subject:
                found.append(finding(context.path, RULE, subject, site.at))

    def wanted(statement):
        return bool(statement_subjects(statement, context, state))

    for scope in [context.tree, *skip_scopes(context.tree)]:
        for statement in unconditional(scope.body, folder, wanted):
            subject = statement_subjects(statement, context, state)[0]
            found.append(finding(context.path, RULE, subject, statement))
    return found
