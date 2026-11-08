import ast

from checks.common import call_name, finding, imported_module, own_nodes
from honesty.mocks.targets import (
    PATCH,
    PATCH_OBJECT,
    SETATTR,
    is_production,
    is_subject,
    locate,
    patch_target,
    subject_of,
)
from honesty.subjects.check import mock_name
from honesty.subjects.targets import imported_modules

RULE = "patch-misses-lookup"
PATCHES = {PATCH, PATCH_OBJECT, SETATTR}
DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)


def assigned(statement):
    if isinstance(statement, ast.Assign):
        return [item.id for item in statement.targets if isinstance(item, ast.Name)]
    if isinstance(statement, ast.AnnAssign) and isinstance(statement.target, ast.Name):
        return [statement.target.id]
    return []


def defines(tree, name):
    for statement in tree.body:
        if isinstance(statement, DEFINITIONS) and statement.name == name:
            return True
        if name in assigned(statement):
            return True
    return False


def patches(context):
    for node in ast.walk(context.tree):
        name = mock_name(call_name(node, context.aliases) or "")
        target = patch_target(node, name, context.aliases) if name in PATCHES else None
        located = locate(context.project, target) if target else None
        if located is not None and not located[2]:
            yield node, target, located[:2]


def imported_paths(context):
    project = context.project
    found = {project.module_path(dotted) for dotted in imported_modules(context)}
    return sorted(path for path in found if path and is_production(project, path))


def bindings(project, path, defining, name):
    for node in own_nodes(project.contexts[path].tree):
        if not isinstance(node, ast.ImportFrom):
            continue
        module = imported_module(node, project, path)
        if not module or project.module_path(module) != defining:
            continue
        for alias in node.names:
            if alias.name == name:
                yield alias.asname or name


def lookups(context, defining, name):
    project = context.project
    for path in imported_paths(context):
        if path == defining:
            continue
        for alias in bindings(project, path, defining, name):
            yield path, alias


def check(context):
    if not context.tests:
        return []
    project = context.project
    subject = subject_of(context)
    found = list(patches(context))
    patched = {place for _, _, place in found}
    findings = []
    for node, target, (path, name) in found:
        if not is_production(project, path) or is_subject(target, subject):
            continue
        if not defines(project.contexts[path].tree, name):
            continue
        missed = [
            (where, alias)
            for where, alias in lookups(context, path, name)
            if (where, alias) not in patched
        ]
        if missed:
            where, alias = missed[0]
            place = f"{project.module_name(where)}.{alias}"
            subject_text = f"{target} (looked up as {place})"
            findings.append(finding(context.path, RULE, subject_text, node))
    return findings
