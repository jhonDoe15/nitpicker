import ast

from checks.common import dotted_name, finding
from honesty.switches.marks import mark_sites
from silent_tests.calls import own_nodes

RULE = "skipped-test-without-reason"
PYTEST_MARKS = {"skip", "skipif", "xfail"}
UNITTEST_REASON_POSITION = {"skip": 0, "skipIf": 1, "skipUnless": 1}
REASON_KEYWORDS = {"reason", "msg"}
PYTEST_CALLS = {"pytest.skip", "pytest.xfail"}
EXPECTED_FAILURE = "unittest.expectedFailure"
SKIP_EXCEPTIONS = {"SkipTest"}


def has_text(value):
    if isinstance(value, ast.Constant):
        return isinstance(value.value, str) and bool(value.value.strip())
    return True


def keyword_value(call, names):
    for keyword in call.keywords:
        if keyword.arg in names:
            return keyword.value
    return None


def positional(call, position):
    return call.args[position] if len(call.args) > position else None


def pytest_mark_name(dotted):
    parts = dotted.split(".")
    if len(parts) >= 3 and parts[0] == "pytest" and parts[-2] == "mark":
        return parts[-1] if parts[-1] in PYTEST_MARKS else None
    return None


def unittest_name(dotted):
    parts = dotted.split(".")
    if len(parts) == 2 and parts[0] == "unittest":
        if parts[1] in UNITTEST_REASON_POSITION or parts[1] == "expectedFailure":
            return parts[1]
    return None


def reason_given(node, dotted):
    call = node if isinstance(node, ast.Call) else None
    mark = pytest_mark_name(dotted)
    if mark is not None:
        if call is None:
            return False
        reasons = [keyword_value(call, {"reason"})]
        if mark == "skip":
            reasons.append(positional(call, 0))
        if mark == "xfail":
            reasons.append(keyword_value(call, {"raises"}))
        return any(r is not None and has_text(r) for r in reasons)
    name = unittest_name(dotted)
    if name is None or name == "expectedFailure" or call is None:
        return False
    reason = positional(call, UNITTEST_REASON_POSITION[name])
    return reason is not None and has_text(reason)


def mark_subject(node, aliases):
    target = node.func if isinstance(node, ast.Call) else node
    dotted = dotted_name(target, aliases) or ""
    if pytest_mark_name(dotted) is None and unittest_name(dotted) is None:
        return None
    return None if reason_given(node, dotted) else dotted


def reasonless_call(node, aliases):
    name = dotted_name(node.func, aliases)
    if name in PYTEST_CALLS:
        given = [positional(node, 0), keyword_value(node, REASON_KEYWORDS)]
        if any(g is not None and has_text(g) for g in given):
            return None
        return f"{name}()"
    if isinstance(node.func, ast.Attribute) and node.func.attr == "skipTest":
        given = positional(node, 0)
        return None if given is not None and has_text(given) else "skipTest()"
    return None


def raised_skip(node, aliases):
    exception = node.exc
    call = exception if isinstance(exception, ast.Call) else None
    name = dotted_name(call.func if call else exception, aliases) or ""
    if name.rsplit(".", 1)[-1] not in SKIP_EXCEPTIONS:
        return None
    given = positional(call, 0) if call else None
    return None if given is not None and has_text(given) else "SkipTest"


def is_test_function(node):
    return isinstance(
        node, (ast.FunctionDef, ast.AsyncFunctionDef)
    ) and node.name.startswith("test")


def is_bare_return(statement):
    if not isinstance(statement, ast.Return):
        return False
    value = statement.value
    return value is None or (isinstance(value, ast.Constant) and value.value is None)


def early_returns(function):
    found = [
        node
        for node in own_nodes(function)
        if isinstance(node, ast.If)
        and not node.orelse
        and len(node.body) == 1
        and is_bare_return(node.body[0])
    ]
    return sorted(found, key=lambda node: node.lineno)


def node_findings(node, context):
    found = []
    if isinstance(node, ast.Call):
        subject = reasonless_call(node, context.aliases)
        if subject:
            found.append(finding(context.path, RULE, subject, node))
    if isinstance(node, ast.Raise) and node.exc is not None:
        subject = raised_skip(node, context.aliases)
        if subject:
            found.append(finding(context.path, RULE, subject, node))
    if is_test_function(node):
        found.extend(
            finding(context.path, RULE, f"return in {node.name}", statement)
            for statement in early_returns(node)
        )
    return found


def mark_findings(context):
    found = []
    for site in mark_sites(context):
        subject = mark_subject(site.expression, context.aliases)
        if subject:
            found.append(finding(context.path, RULE, subject, site.at))
    return found


def check(context):
    if not context.tests:
        return []
    found = mark_findings(context)
    for node in ast.walk(context.tree):
        found.extend(node_findings(node, context))
    return found
