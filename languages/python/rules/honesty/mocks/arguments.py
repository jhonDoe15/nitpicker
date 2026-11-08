import ast

from checks.common import call_name
from honesty.mocks.expected import expected_class
from honesty.subjects.check import mock_name
from honesty.subjects.targets import enclosing, is_fixture, returned_values, target_text

FACTORIES = {
    "mock.Mock",
    "mock.MagicMock",
    "mock.AsyncMock",
    "mock.NonCallableMock",
    "mock.NonCallableMagicMock",
}
SPEC_ARGUMENTS = {"spec", "spec_set", "wraps"}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
SELF_NAMES = ("self.", "cls.")


def is_unspecced(node, aliases):
    if mock_name(call_name(node, aliases) or "") not in FACTORIES:
        return False
    return not node.args and not any(
        item.arg is None or item.arg in SPEC_ARGUMENTS for item in node.keywords
    )


def slot_of(node, call):
    for index, item in enumerate(call.args):
        if isinstance(item, ast.Starred):
            return None
        if item is node:
            return "position", index
    for item in call.keywords:
        if item.value is node and item.arg is not None:
            return "keyword", item.arg
    return None


def call_slots(context, node):
    call = context.parents.get(id(node))
    if isinstance(call, ast.keyword):
        call = context.parents.get(id(call))
    slot = slot_of(node, call) if isinstance(call, ast.Call) else None
    return [(call, slot)] if slot else []


def uses(context, scope, text):
    for node in ast.walk(scope):
        if isinstance(node, (ast.Name, ast.Attribute)) and target_text(node) == text:
            yield from call_slots(context, node)


def binding_scope(context, node, text):
    kinds = ast.ClassDef if text.startswith(SELF_NAMES) else FUNCTIONS
    return enclosing(context, node, kinds) or context.tree


def bound_slots(context, mock):
    parent = context.parents.get(id(mock))
    if not isinstance(parent, ast.Assign) or len(parent.targets) != 1:
        return []
    text = target_text(parent.targets[0])
    if not text:
        return []
    found = list(uses(context, binding_scope(context, parent, text), text))
    owner = enclosing(context, parent, FUNCTIONS)
    if owner is not None and is_fixture(owner, context.aliases):
        returned = {target_text(value) for value in returned_values(owner)}
        found += fixture_slots(context, owner) if text in returned else []
    return found


def fixture_slots(context, fixture):
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, FUNCTIONS) or node is fixture:
            continue
        names = {item.arg for item in node.args.args + node.args.kwonlyargs}
        if fixture.name in names:
            found.extend(uses(context, node, fixture.name))
    return found


def returned_slots(context, mock):
    parent = context.parents.get(id(mock))
    if not isinstance(parent, (ast.Return, ast.Yield)):
        return []
    owner = enclosing(context, parent, FUNCTIONS)
    if owner is None or not is_fixture(owner, context.aliases):
        return []
    return fixture_slots(context, owner)


def slots_of(context, mock):
    return (
        call_slots(context, mock)
        + bound_slots(context, mock)
        + returned_slots(context, mock)
    )


def is_subject_class(found, subject):
    return subject is not None and found.path == subject.path


def unspecced_mocks(context, subject):
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call) or not is_unspecced(node, context.aliases):
            continue
        for call, slot in slots_of(context, node):
            expected = expected_class(context, call, slot)
            if expected is not None and not is_subject_class(expected, subject):
                yield node, expected
                break
