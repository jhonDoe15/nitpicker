import ast

from checks.common import dotted_name, finding, functions_of, own_nodes

PATH_FACTORIES = {
    "pathlib.Path",
    "pathlib.PurePath",
    "pathlib.PurePosixPath",
    "pathlib.PosixPath",
    "Path",
    "PurePath",
    "os.path.join",
    "posixpath.join",
    "ntpath.join",
}
SAFE_CALLS = {
    "int",
    "float",
    "bool",
    "len",
    "hash",
    "uuid.UUID",
    "UUID",
    "os.path.basename",
    "posixpath.basename",
    "basename",
    "secure_filename",
    "werkzeug.utils.secure_filename",
}
SAFE_ATTRIBUTES = {"name", "stem", "suffix", "suffixes", "parent"}
PATH_TYPES = {
    "str",
    "Path",
    "PurePath",
    "PathLike",
    "bytes",
    "os.PathLike",
    "pathlib.Path",
}
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
SINK_CALLS = {
    "open",
    "io.open",
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
    "shutil.copy",
    "shutil.copyfile",
    "shutil.copy2",
    "shutil.copytree",
    "shutil.move",
    "shutil.rmtree",
    "send_file",
    "send_from_directory",
    "flask.send_file",
    "flask.send_from_directory",
    "FileResponse",
    "starlette.responses.FileResponse",
    "fastapi.responses.FileResponse",
}
CONTAINMENT_METHODS = {"is_relative_to", "relative_to", "startswith", "commonpath"}
EXITS = (ast.Return, ast.Raise, ast.Continue, ast.Break)
MAX_DEPTH = 6


PATH_TYPE_NAMES = {name.rsplit(".", 1)[-1] for name in PATH_TYPES}


def annotation_names(annotation, aliases):
    nodes = (
        n for n in ast.walk(annotation) if isinstance(n, (ast.Name, ast.Attribute))
    )
    return {(dotted_name(node, aliases) or "").rsplit(".", 1)[-1] for node in nodes}


def annotation_allows_path(annotation, aliases):
    if annotation is None:
        return True
    names = annotation_names(annotation, aliases)
    return "Literal" not in names and bool(names & PATH_TYPE_NAMES)


def parameters_of(function, aliases):
    arguments = function.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    return {
        a.arg
        for a in every
        if a.arg not in {"self", "cls"}
        and annotation_allows_path(a.annotation, aliases)
    }


class Taint:
    def __init__(self, parameters, assignments, aliases):
        self.parameters = parameters
        self.assignments = assignments
        self.aliases = aliases

    def is_tainted(self, node, depth=0):
        if depth > MAX_DEPTH or node is None:
            return False
        if isinstance(node, ast.Name):
            if node.id in self.parameters:
                return True
            return any(
                self.is_tainted(value, depth + 1)
                for value in self.assignments.get(node.id, [])
            )
        if isinstance(node, ast.Attribute):
            return node.attr not in SAFE_ATTRIBUTES and self.is_tainted(
                node.value, depth + 1
            )
        if isinstance(node, ast.Call):
            if dotted_name(node.func, self.aliases) in SAFE_CALLS:
                return False
            parts = [node.func, *node.args, *[k.value for k in node.keywords]]
            return any(self.is_tainted(part, depth + 1) for part in parts)
        children = [c for c in ast.iter_child_nodes(node) if isinstance(c, ast.expr)]
        return any(self.is_tainted(child, depth + 1) for child in children)

    def builds_from_parameter(self, node, depth=0):
        if depth > MAX_DEPTH or node is None:
            return False
        if isinstance(node, ast.Name):
            return any(
                self.builds_from_parameter(v, depth + 1)
                for v in self.assignments.get(node.id, [])
            )
        if isinstance(node, ast.BinOp) and isinstance(
            node.op, (ast.Div, ast.Add, ast.Mod)
        ):
            return self.is_tainted(node.right) or self.builds_from_parameter(
                node.left, depth + 1
            )
        if isinstance(node, ast.JoinedStr):
            return any(
                self.is_tainted(v)
                for v in node.values
                if isinstance(v, ast.FormattedValue)
            )
        if isinstance(node, ast.Call):
            return self.call_builds(node, depth)
        if isinstance(node, ast.Attribute):
            return self.builds_from_parameter(node.value, depth + 1)
        return False

    def call_builds(self, node, depth):
        name = dotted_name(node.func, self.aliases)
        if name in PATH_FACTORIES:
            return (
                any(self.is_tainted(arg) for arg in node.args[1:])
                or any(
                    self.builds_from_parameter(arg, depth + 1) for arg in node.args[:1]
                )
                or any(
                    isinstance(arg, ast.JoinedStr) and self.is_tainted(arg)
                    for arg in node.args
                )
            )
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == "joinpath":
                return any(
                    self.is_tainted(arg) for arg in node.args
                ) or self.builds_from_parameter(node.func.value, depth + 1)
            return self.builds_from_parameter(node.func.value, depth + 1)
        return False


def assignments_of(function):
    values = {}
    for node in own_nodes(function):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    values.setdefault(target.id, []).append(node.value)
        elif (
            isinstance(node, ast.AnnAssign)
            and isinstance(node.target, ast.Name)
            and node.value
        ):
            values.setdefault(node.target.id, []).append(node.value)
    return values


def sink_paths(call, aliases):
    name = dotted_name(call.func, aliases)
    if name in SINK_CALLS and call.args:
        return (
            call.args[:2]
            if name.startswith("shutil.") or name in {"os.rename", "os.replace"}
            else call.args[:1]
        )
    if isinstance(call.func, ast.Attribute) and call.func.attr in SINK_METHODS:
        return [call.func.value]
    return []


def contains_check(test):
    for node in ast.walk(test):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr in CONTAINMENT_METHODS:
                return True
        if isinstance(node, ast.Call) and (
            isinstance(node.func, ast.Name) and node.func.id in CONTAINMENT_METHODS
        ):
            return True
    return False


def ends_with_exit(body):
    return bool(body) and isinstance(body[-1], EXITS)


def has_containment(function):
    for node in own_nodes(function):
        if isinstance(node, ast.If) and contains_check(node.test):
            return True
        if isinstance(node, ast.Try) and any(
            ends_with_exit(h.body) for h in node.handlers
        ):
            if any(contains_check(statement) for statement in node.body):
                return True
    return False


def function_findings(path, function, aliases):
    parameters = parameters_of(function, aliases)
    if not parameters or has_containment(function):
        return []
    taint = Taint(parameters, assignments_of(function), aliases)
    for node in own_nodes(function):
        if isinstance(node, ast.Call):
            if any(
                taint.builds_from_parameter(target)
                for target in sink_paths(node, aliases)
            ):
                return [finding(path, "unsafe-path-join", function.name, node)]
    return []


def check(context):
    if context.tests:
        return []
    found = []
    for function in functions_of(context.tree):
        found.extend(function_findings(context.path, function, context.aliases))
    return found
