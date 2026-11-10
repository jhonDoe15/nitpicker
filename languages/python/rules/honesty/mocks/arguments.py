import ast

from checks.common import call_name
from honesty.mocks.expected import expected_class
from honesty.subjects.check import mock_name
from honesty.subjects.targets import (
    FUNCTIONS,
    binding_scope,
    enclosing,
    is_fixture,
    returned_values,
    target_text,
)

FACTORIES = {
    "mock.Mock",
    "mock.MagicMock",
    "mock.AsyncMock",
    "mock.NonCallableMock",
    "mock.NonCallableMagicMock",
}
SPEC_ARGUMENTS = {"spec", "spec_set", "wraps"}
TEST_PREFIX = "test"


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


def bound_target(parent):
    if isinstance(parent, ast.Assign) and len(parent.targets) == 1:
        return parent.targets[0]
    return parent.target if isinstance(parent, ast.AnnAssign) else None


def bindings_of(scope, text):
    return sum(
        1
        for node in ast.walk(scope)
        if (target := bound_target(node)) is not None and target_text(target) == text
    )


def bound_slots(context, mock):
    parent = context.parents.get(id(mock))
    target = bound_target(parent)
    text = target_text(target) if target is not None else None
    if not text:
        return []
    scope = binding_scope(context, parent, text) or context.tree
    if bindings_of(scope, text) != 1:
        return []
    found = list(uses(context, scope, text))
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
        if not node.name.startswith(TEST_PREFIX) and not is_fixture(node, context.aliases):
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
