import ast

from checks.common import call_name, dotted_name, finding, string_value
from honesty.mocks.targets import (
    PATCH,
    PATCH_OBJECT,
    SETATTR,
    is_production,
    is_subject,
    locate,
    patch_target,
    resolve,
    subject_of,
)
from honesty.subjects.check import argument, mock_name

RULE = "internal-module-patch"
PATCH_DICT = "mock.patch.dict"
PATCHES = {PATCH, PATCH_OBJECT, SETATTR}


def dict_target(node, aliases):
    first = argument(node, 0, "in_dict")
    if first is None:
        return None
    return string_value(first) or dotted_name(first, aliases)


def target_of(node, name, aliases):
    if name == PATCH_DICT:
        return dict_target(node, aliases)
    return patch_target(node, name, aliases) if name in PATCHES else None


def is_project_code(project, name, target):
    if name == PATCH_DICT:
        located = locate(project, target)
        return located is not None and is_production(project, located[0])
    return resolve(project, target) is not None


def check(context):
    if not context.tests:
        return []
    project = context.project
    subject = subject_of(context)
    found = []
    for node in ast.walk(context.tree):
        name = mock_name(call_name(node, context.aliases) or "")
        target = target_of(node, name, context.aliases) if name else None
        if target and is_project_code(project, name, target) and not is_subject(target, subject):
            found.append(finding(context.path, RULE, target, node))
    return found
