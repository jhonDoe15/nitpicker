import ast

from checks.common import dotted_name, finding, own_nodes
from boundary.path_taint import (
    Taint,
    assignments_of,
    path_factories,
    tainted_parameters,
)

SINK_METHODS = {
    "read_text",
    "read_bytes",
    "write_text",
    "write_bytes",
    "open",
    "unlink",
    "rmdir",
    "mkdir",
    "touch",
    "rename",
    "replace",
    "stat",
    "iterdir",
    "exists",
    "is_file",
    "is_dir",
    "chmod",
    "symlink_to",
    "hardlink_to",
}
PATTERN_METHODS = {"glob", "rglob"}
SINK_CALLS = {
    "open",
    "io.open",
    "codecs.open",
    "aiofiles.open",
    "zipfile.ZipFile",
    "tarfile.open",
    "os.remove",
    "os.unlink",
    "os.rename",
    "os.replace",
    "os.rmdir",
    "os.mkdir",
    "os.makedirs",
    "os.listdir",
    "os.scandir",
    "os.stat",
    "os.chmod",
    "os.path.exists",
    "os.path.isfile",
    "os.path.isdir",
    "shutil.copy",
    "shutil.copyfile",
    "shutil.copy2",
    "shutil.copytree",
    "shutil.move",
    "shutil.rmtree",
    "send_file",
    "flask.send_file",
    "FileResponse",
    "starlette.responses.FileResponse",
    "fastapi.responses.FileResponse",
}
PATTERN_CALLS = {"glob.glob", "glob.iglob"}
TWO_PATH_CALLS = {"os.rename", "os.replace"}
NORMALIZERS = {"resolve", "realpath", "abspath", "normpath"}
CONTAINMENT_METHODS = {"is_relative_to", "relative_to", "startswith", "commonpath"}
EXITS = (ast.Return, ast.Raise, ast.Continue, ast.Break)
SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)


def sink_paths(call, aliases):
    name = dotted_name(call.func, aliases)
    if name in SINK_CALLS and call.args:
        two = name.startswith("shutil.") or name in TWO_PATH_CALLS
        return call.args[:2] if two else call.args[:1]
    if name in PATTERN_CALLS and call.args:
        return call.args[:1]
    if isinstance(call.func, ast.Attribute):
        if call.func.attr in SINK_METHODS:
            return [call.func.value]
        if call.func.attr in PATTERN_METHODS and call.args:
            return call.args[:1]
    return []


def mentions(node, name):
    return any(isinstance(n, ast.Name) and n.id == name for n in ast.walk(node))


def contains_check(test, name):
    for node in ast.walk(test):
        if not isinstance(node, ast.Call):
            continue
        function = node.func
        method = function.attr if isinstance(function, ast.Attribute) else None
        method = method or (function.id if isinstance(function, ast.Name) else None)
        if method in CONTAINMENT_METHODS and mentions(node, name):
            return True
    return False


def ends_with_exit(body):
    return bool(body) and isinstance(body[-1], EXITS)


def is_normalizing(value, aliases):
    if not isinstance(value, ast.Call):
        return False
    if isinstance(value.func, ast.Attribute):
        return value.func.attr in NORMALIZERS
    return (dotted_name(value.func, aliases) or "").rsplit(".", 1)[-1] in NORMALIZERS


def has_containment(scope, name, assignments, aliases):
    if not any(is_normalizing(v, aliases) for v in assignments.get(name, [])):
        return False
    for node in own_nodes(scope):
        if isinstance(node, ast.If) and contains_check(node.test, name):
            return True
        if isinstance(node, ast.Try) and any(
            ends_with_exit(h.body) for h in node.handlers
        ):
            if any(contains_check(statement, name) for statement in node.body):
                return True
    return False


def is_contained(target, scope, assignments, aliases):
    return isinstance(target, ast.Name) and has_containment(
        scope, target.id, assignments, aliases
    )


def scope_parameters(scope, context, parents):
    names = tainted_parameters(scope, context.aliases)
    own = set(assignments_of(scope))
    parent = parents.get(id(scope))
    while parent is not None:
        if isinstance(parent, SCOPES):
            names |= tainted_parameters(parent, context.aliases) - own
        parent = parents.get(id(parent))
    return names


def scope_name(scope):
    return "<lambda>" if isinstance(scope, ast.Lambda) else scope.name


def scope_findings(context, scope, factories):
    parameters = scope_parameters(scope, context, context.parents)
    if not parameters:
        return []
    assignments = assignments_of(scope)
    taint = Taint(parameters, assignments, context, factories)
    found = []
    for node in own_nodes(scope):
        if not isinstance(node, ast.Call):
            continue
        for target in sink_paths(node, context.aliases):
            if taint.builds_from_parameter(target) and not is_contained(
                target, scope, assignments, context.aliases
            ):
                found.append(
                    finding(context.path, "unsafe-path-join", scope_name(scope), node)
                )
                break
    return found


def check(context):
    if context.tests:
        return []
    factories = path_factories(context.project)
    found = []
    for scope in ast.walk(context.tree):
        if isinstance(scope, SCOPES):
            found.extend(scope_findings(context, scope, factories))
    return found
