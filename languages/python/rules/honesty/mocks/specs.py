import ast

from checks.common import call_name, finding
from honesty.mocks.arguments import unspecced_mocks
from honesty.mocks.lookup import missed_lookups
from honesty.mocks.targets import (
    PATCH,
    PATCH_OBJECT,
    is_subject,
    patch_target,
    resolve,
    subject_of,
)
from honesty.subjects.check import mock_name

RULE = "mock-without-spec"
SPEC_KEYWORDS = {"autospec", "spec", "spec_set", "new", "new_callable"}
NEW_POSITIONS = {PATCH: 1, PATCH_OBJECT: 2}
OFF = (False, None)


def is_off(item):
    return item.arg == "autospec" and (
        isinstance(item.value, ast.Constant) and item.value.value in OFF
    )


def is_specced(node, name):
    if len(node.args) > NEW_POSITIONS[name]:
        return True
    return any(
        item.arg is None or (item.arg in SPEC_KEYWORDS and not is_off(item))
        for item in node.keywords
    )


def unspecced_patches(context, subject):
    missed = {id(node) for node, _ in missed_lookups(context)}
    for node in ast.walk(context.tree):
        name = mock_name(call_name(node, context.aliases) or "")
        if name not in NEW_POSITIONS or id(node) in missed or is_specced(node, name):
            continue
        target = patch_target(node, name, context.aliases)
        found = resolve(context.project, target) if target else None
        if found is not None and not is_subject(target, subject):
            yield finding(context.path, RULE, f"patch of {found.dotted}", node)


def check(context):
    if not context.tests:
        return []
    subject = subject_of(context)
    found = list(unspecced_patches(context, subject))
    found.extend(
        finding(context.path, RULE, f"Mock() for {expected.dotted}", node)
        for node, expected in unspecced_mocks(context, subject)
    )
    return found
