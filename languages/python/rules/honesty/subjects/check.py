import ast

from checks.common import call_name, dotted_name, finding, string_value
from honesty.subjects.targets import (
    defined_names,
    instance_names,
    is_subject_target,
    subject_class,
    subject_path,
    subject_stem,
    target_text,
    visible_instances,
)

RULE = "mocked-subject-in-test"
MOCK_PREFIXES = ("unittest.mock.", "mocker.")
PATCH = "mock.patch"
PATCH_OBJECT = "mock.patch.object"
PATCH_MULTIPLE = "mock.patch.multiple"
SETATTR = "monkeypatch.setattr"
MOCK_FACTORIES = {
    "mock.Mock",
    "mock.MagicMock",
    "mock.NonCallableMock",
    "mock.NonCallableMagicMock",
    "mock.AsyncMock",
}
AUTOSPEC = "mock.create_autospec"
SPEC_KEYWORDS = {"spec", "spec_set"}


class Subject:
    def __init__(self, context, path):
        self.project = context.project
        self.path = path
        self.functions, self.classes = defined_names(self.project.contexts[path].tree)


def mock_name(name):
    for prefix in MOCK_PREFIXES:
        if name.startswith(prefix):
            return f"mock.{name[len(prefix) :]}"
    return name


def argument(node, position, keyword):
    for item in node.keywords:
        if item.arg == keyword:
            return item.value
    return node.args[position] if len(node.args) > position else None


def instance_method(owner, attribute, context, state):
    instances = visible_instances(context, state.node, state.instances)
    built = instances.get(target_text(owner))
    if built is None or attribute not in state.subject.classes[built]:
        return None
    return f"{target_text(owner)}.{attribute}"


def object_target(owner, attribute, context, state):
    attribute = string_value(attribute) if attribute is not None else None
    if owner is None or attribute is None:
        return None
    method = instance_method(owner, attribute, context, state)
    if method is not None:
        return method
    dotted = dotted_name(owner, context.aliases)
    target = f"{dotted}.{attribute}" if dotted else None
    return target if is_subject_target(target, state.subject) else None


def string_target(node, state):
    target = string_value(node) if node is not None else None
    return target if is_subject_target(target, state.subject) else None


def patched_targets(node, name, context, state):
    if name == PATCH:
        return [string_target(argument(node, 0, "target"), state)]
    if name == PATCH_OBJECT:
        return [
            object_target(
                argument(node, 0, "target"),
                argument(node, 1, "attribute"),
                context,
                state,
            )
        ]
    if name == PATCH_MULTIPLE:
        first = argument(node, 0, "target")
        module = string_value(first) or dotted_name(first, context.aliases) or ""
        return [
            string_target(ast.Constant(f"{module}.{item.arg}"), state)
            for item in node.keywords
            if item.arg
        ]
    if name == SETATTR:
        first = argument(node, 0, "target")
        if len(node.args) >= 3:
            return [object_target(first, node.args[1], context, state)]
        return [string_target(first, state)]
    return []


def mocked_class(node, name, context, state):
    if name not in MOCK_FACTORIES and name != AUTOSPEC:
        return None
    spec = node.args[0] if node.args else None
    spec = spec or next(
        (item.value for item in node.keywords if item.arg in SPEC_KEYWORDS), None
    )
    dotted = dotted_name(spec, context.aliases) if spec is not None else None
    return dotted if subject_class(dotted, state.subject) else None


def assigned_mocks(context, state):
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Call):
            continue
        if mock_name(
            call_name(node.value, context.aliases) or ""
        ) not in MOCK_FACTORIES | {AUTOSPEC}:
            continue
        state.node = node
        for target in node.targets:
            if not isinstance(target, ast.Attribute):
                continue
            method = instance_method(target.value, target.attr, context, state)
            if method is not None:
                yield finding(context.path, RULE, method, node)


class State:
    def __init__(self, subject, instances):
        self.subject = subject
        self.instances = instances
        self.node = None


def check(context):
    stem = subject_stem(context.path) if context.tests else None
    path = subject_path(context, stem) if stem else None
    if path is None or path not in context.project.contexts:
        return []
    subject = Subject(context, path)
    state = State(subject, instance_names(context, subject))
    found = list(assigned_mocks(context, state))
    for node in ast.walk(context.tree):
        name = mock_name(call_name(node, context.aliases) or "")
        if not name:
            continue
        state.node = node
        targets = patched_targets(node, name, context, state)
        targets.append(mocked_class(node, name, context, state))
        found.extend(
            finding(context.path, RULE, target, node) for target in targets if target
        )
    return found
