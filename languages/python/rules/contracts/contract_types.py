import ast
import os

from checks.common import finding
from contracts.infrastructure import infrastructure_in
from contracts.members import definition_members, is_public
from contracts.web import (
    imports_web,
    route_decorators,
    signature_sites,
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
    "config",
    "configuration",
    "security",
}
WEB_MODULES = {
    "views",
    "routes",
    "router",
    "routers",
    "api",
    "endpoints",
    "urls",
    "middleware",
}
INIT_MODULE = "__init__"
STAR = "*"
ALL = "__all__"
DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)


def module_stem(path):
    return os.path.splitext(os.path.basename(path))[0]


def own_definitions(context):
    for node in context.tree.body:
        if isinstance(node, DEFINITIONS) and is_public(node.name):
            yield node.name, node


def definition_in(context, name):
    for node in context.tree.body:
        if isinstance(node, DEFINITIONS) and node.name == name:
            return node
    return None


def assigns_all(node):
    return isinstance(node, ast.Assign) and any(
        getattr(target, "id", None) == ALL for target in node.targets
    )


def declared_all(context):
    for node in context.tree.body:
        if assigns_all(node) and isinstance(node.value, (ast.List, ast.Tuple)):
            return [e.value for e in node.value.elts if isinstance(e, ast.Constant)]
    return None


def star_names(owner):
    names = declared_all(owner)
    return names if names is not None else [name for name, _ in own_definitions(owner)]


def imported_module(context, node):
    project = context.project
    module = (
        project.relative_module(context.path, node.level, node.module)
        if node.level
        else node.module
    )
    path = project.module_path(module) if module else None
    return project.contexts.get(path) if path else None


def star_exports(context, node):
    owner = imported_module(context, node)
    if owner is None:
        return
    for name in star_names(owner):
        definition = definition_in(owner, name)
        if definition is not None and is_public(name):
            yield name, definition, node, owner


def named_export(context, node, alias):
    name = alias.asname or alias.name
    target = context.aliases[0].get(name, "")
    located = context.project.locate(target) if "." in target else None
    owner = context.project.contexts.get(located[0]) if located else None
    definition = definition_in(owner, located[1]) if owner else None
    if definition is not None and is_public(name):
        yield name, definition, node, owner


def reexported(context):
    for node in context.tree.body:
        if not isinstance(node, ast.ImportFrom):
            continue
        for alias in node.names:
            if alias.name == STAR:
                yield from star_exports(context, node)
            else:
                yield from named_export(context, node, alias)


def exported(context):
    for name, node in own_definitions(context):
        yield name, node, None, context
    if module_stem(context.path) == INIT_MODULE:
        yield from reexported(context)


def allowed_kinds(function, owner, method):
    if route_decorators(function, owner, imports_web(owner)):
        return set()
    web = module_stem(owner.path) in WEB_MODULES
    if web or takes_request_first(function, owner, method):
        return {"persistence"}
    return {"persistence", "transport"}


def member_findings(context, member):
    label, function, method, anchor, owner = member
    kinds = allowed_kinds(function, owner, method)
    found = []
    for _, annotation in signature_sites(function, owner):
        found.extend(infrastructure_in(annotation, owner))
    leaks = [(kind, name) for kind, name in dict.fromkeys(found) if kind in kinds]
    return [
        finding(context.path, RULE, f"{label}|{kind}|{name.rsplit('.', 1)[-1]}", anchor)
        for kind, name in leaks
    ]


def check(context):
    faces = context.options.get("contractFaces") or {}
    if faces.get(context.path) is None or context.tests:
        return []
    if module_stem(context.path) in INFRASTRUCTURE_MODULES:
        return []
    found = []
    for name, node, anchor, owner in exported(context):
        for label, function, method in definition_members(node, owner, name):
            member = (label, function, method, anchor or function, owner)
            found.extend(member_findings(context, member))
    return found
