import ast
import os

from boundary.domain_types import annotations_of
from checks.common import finding
from contracts.infrastructure import infrastructure_in
from contracts.members import (
    definition_members,
    is_public,
    is_route_handler,
    takes_request_first,
)

RULE = "contract-infrastructure-type"
INFRASTRUCTURE_MODULES = {
    "adapter",
    "adapters",
    "infrastructure",
    "infra",
    "persistence",
    "repository",
    "repositories",
    "db",
    "database",
    "dependencies",
    "deps",
}
WEB_MODULES = {"views", "routes", "routers", "api", "endpoints", "urls", "middleware"}
INIT_MODULE = "__init__"


def module_stem(path):
    return os.path.splitext(os.path.basename(path))[0]


def own_definitions(context):
    for node in context.tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if is_public(node.name):
                yield node.name, node


def is_internal_module(path, directory, faces):
    return path.startswith(f"{directory}/") and path not in faces


def reexported(context, directory, faces):
    for node in context.tree.body:
        if not isinstance(node, ast.ImportFrom):
            continue
        for alias in node.names:
            name = alias.asname or alias.name
            target = context.aliases[0].get(name, "")
            located = context.project.locate(target) if "." in target else None
            if (
                is_public(name)
                and located
                and is_internal_module(located[0], directory, faces)
            ):
                yield name, located, node


def definition_in(context, name):
    for node in context.tree.body:
        if getattr(node, "name", None) == name:
            return node
    return None


def resolved_exports(context, directory, faces):
    for name, (path, original), anchor in reexported(context, directory, faces):
        owner = context.project.contexts.get(path)
        node = definition_in(owner, original) if owner else None
        if node is not None:
            yield name, node, anchor, owner


def exported(context, directory, faces):
    for name, node in own_definitions(context):
        yield name, node, None, context
    if module_stem(context.path) == INIT_MODULE:
        yield from resolved_exports(context, directory, faces)


def allowed_kinds(function, owner, method):
    if is_route_handler(function, owner):
        return set()
    web = module_stem(owner.path) in WEB_MODULES
    if web or takes_request_first(function, owner, method):
        return {"persistence"}
    return {"persistence", "transport"}


def member_findings(context, member, feature):
    label, function, method, anchor, owner = member
    kinds = allowed_kinds(function, owner, method)
    found = []
    for annotation in annotations_of(function):
        found.extend(infrastructure_in(annotation, owner))
    leaks = [(kind, name) for kind, name in dict.fromkeys(found) if kind in kinds]
    return [
        finding(context.path, RULE, f"{label}|{kind}|{name}|{feature}", anchor)
        for kind, name in leaks
    ]


def check(context):
    faces = context.options.get("contractFaces") or {}
    directory = faces.get(context.path)
    if directory is None or context.tests:
        return []
    if module_stem(context.path) in INFRASTRUCTURE_MODULES:
        return []
    feature = directory.rsplit("/", 1)[-1]
    found = []
    for name, node, anchor, owner in exported(context, directory, faces):
        for label, function, method in definition_members(node, owner, name):
            member = (label, function, method, anchor or function, owner)
            found.extend(member_findings(context, member, feature))
    return found
