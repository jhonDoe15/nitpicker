import ast

from checks.common import dotted_name, finding, imported_module
from checks.state import mutated_state
from effects.import_time import is_type_checking_block
from index.tables import tables_of

LOGGER_MODULES = {"logging", "structlog", "loguru"}
REEXPORT_HOPS = 4


def type_only_nodes(tree, aliases):
    inside = set()
    for node in ast.walk(tree):
        if is_type_checking_block(node, aliases):
            inside.update(id(child) for part in node.body for child in ast.walk(part))
    return inside


def logger_findings(context, skipped):
    found = []
    for node in ast.walk(context.tree):
        if id(node) in skipped:
            continue
        if isinstance(node, ast.Import):
            modules = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            modules = [node.module]
        else:
            continue
        for module in modules:
            if module.split(".")[0] in LOGGER_MODULES:
                found.append(finding(context.path, "logger-in-domain", module, node))
    return found


def state_origin(project, dotted):
    for _ in range(REEXPORT_HOPS):
        located = project.locate(dotted) if "." in dotted else None
        if located is None or located[0] not in project.contexts:
            return None
        _collections, instances, _attributes = tables_of(project, located[0])
        if located[1] in instances or located in mutated_state(project):
            return located
        names = project.contexts[located[0]].aliases[0]
        if located[1] not in names:
            return None
        dotted = names[located[1]]
    return None


def references(context, skipped):
    for node in ast.walk(context.tree):
        if id(node) in skipped:
            continue
        if isinstance(node, ast.ImportFrom):
            module = imported_module(node, context.project, context.path)
            for alias in node.names if module else []:
                yield f"{module}.{alias.name}", node
        elif isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Load):
            yield dotted_name(node, context.aliases), node


def state_findings(context, skipped):
    seen, found = set(), []
    ordered = sorted(
        references(context, skipped),
        key=lambda pair: (pair[1].lineno, pair[1].col_offset),
    )
    for dotted, node in ordered:
        origin = state_origin(context.project, dotted) if dotted else None
        if origin is not None and origin not in seen and origin[0] != context.path:
            seen.add(origin)
            subject = f"{context.project.module_name(origin[0])}.{origin[1]}"
            found.append(finding(context.path, "module-state-in-domain", subject, node))
    return found


def check(context):
    if not context.domain:
        return []
    skipped = type_only_nodes(context.tree, context.aliases)
    return logger_findings(context, skipped) + state_findings(context, skipped)
