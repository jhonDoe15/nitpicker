import ast

from checks.common import dotted_name, finding

RULE = "retry-in-test"
FLAKY_MARK = "pytest.mark.flaky"
FLAKY_DECORATOR = "flaky.flaky"
OFF_KEYWORDS = {"reruns": 0, "retries": 0, "max_runs": 1}
TEST_DECORATORS = {
    "tenacity.retry",
    "backoff.on_exception",
    "backoff.on_predicate",
    "stamina.retry",
}


def literal(node):
    return node.value if isinstance(node, ast.Constant) else None


def switched_off(call, off_position):
    if call is None:
        return False
    for keyword in call.keywords:
        if keyword.arg in OFF_KEYWORDS:
            value = literal(keyword.value)
            return value is not True and value is not False and value == OFF_KEYWORDS[keyword.arg]
    if call.args:
        value = literal(call.args[0])
        return value is not True and value is not False and value == off_position
    return False


def marker_retry(node, context):
    if isinstance(node, ast.Call):
        target, call = node.func, node
    else:
        parent = context.parents.get(id(node))
        if isinstance(parent, ast.Call) and parent.func is node:
            return None
        target, call = node, None
    name = dotted_name(target, context.aliases)
    if name == FLAKY_MARK:
        return None if switched_off(call, 0) else name
    if name == FLAKY_DECORATOR:
        return None if switched_off(call, 1) else name
    return None


def is_test_function(node):
    return isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith(
        "test"
    )


def decorator_retries(node, context):
    if not is_test_function(node):
        return []
    found = []
    for decorator in node.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        name = dotted_name(target, context.aliases)
        if name in TEST_DECORATORS:
            found.append(finding(context.path, RULE, f"{name} on {node.name}", decorator))
    return found


def check(context):
    if not context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, (ast.Call, ast.Attribute, ast.Name)):
            subject = marker_retry(node, context)
            if subject:
                found.append(finding(context.path, RULE, subject, node))
        found.extend(decorator_retries(node, context))
    return found
