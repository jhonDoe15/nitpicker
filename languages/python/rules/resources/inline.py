import ast

from checks.common import dotted_name, finding

RULE = "unclosed-inline-resource"
RUFF_CALLS = {
    "open",
    "io.open",
    "codecs.open",
    "gzip.open",
    "bz2.open",
    "lzma.open",
    "tarfile.open",
    "shelve.open",
    "dbm.open",
    "tempfile.TemporaryFile",
    "tempfile.NamedTemporaryFile",
}
OWN_CALLS = {
    "zipfile.ZipFile",
    "tarfile.TarFile",
    "os.fdopen",
    "socket.create_connection",
    "sqlite3.connect",
    "urllib.request.urlopen",
}
PATH_TYPES = {
    "pathlib.Path",
    "pathlib.PurePath",
    "pathlib.PosixPath",
    "pathlib.WindowsPath",
    "Path",
}
WRAPPERS = {
    "io.TextIOWrapper",
    "io.BufferedReader",
    "io.BufferedWriter",
    "io.BufferedRandom",
    "gzip.GzipFile",
    "typing.cast",
}
CONSUMERS = {
    "load",
    "safe_load",
    "full_load",
    "copyfileobj",
    "read_file",
    "file_digest",
    "iterparse",
    "parse",
}
IN_MEMORY = {"io.BytesIO", "io.StringIO"}
SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.Module)


def scope_of(node, parents):
    current = parents.get(id(node))
    while current is not None and not isinstance(current, SCOPES):
        current = parents.get(id(current))
    return current


def annotated_paths(scope, aliases):
    names = set()
    arguments = getattr(scope, "args", None)
    if arguments is not None and not isinstance(scope, ast.Lambda):
        every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
        names.update(
            a.arg
            for a in every
            if a.annotation is not None and is_path_type(a.annotation, aliases)
        )
    for node in ast.walk(scope):
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if is_path_type(node.annotation, aliases):
                names.add(node.target.id)
        if isinstance(node, ast.Assign) and is_path_value(node.value, set(), aliases):
            names.update(t.id for t in node.targets if isinstance(t, ast.Name))
    return names


def is_path_type(annotation, aliases):
    if isinstance(annotation, ast.Constant) and isinstance(annotation.value, str):
        return annotation.value in {"Path", "pathlib.Path"}
    return dotted_name(annotation, aliases) in PATH_TYPES


def is_path_value(node, paths, aliases):
    if isinstance(node, ast.Call):
        name = dotted_name(node.func, aliases) or ""
        base, _, method = name.rpartition(".")
        return name in PATH_TYPES or (base in PATH_TYPES and method in {"home", "cwd"})
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
        return is_path_value(node.left, paths, aliases)
    if isinstance(node, ast.Attribute) and node.attr in {"parent", "with_name", "with_suffix"}:
        return is_path_value(node.value, paths, aliases)
    return isinstance(node, ast.Name) and node.id in paths


def in_return(node, parents):
    current = parents.get(id(node))
    while current is not None and not isinstance(current, ast.stmt):
        current = parents.get(id(current))
    return isinstance(current, ast.Return)


def opener(call, context, paths):
    name = dotted_name(call.func, context.aliases)
    if name in RUFF_CALLS:
        return "ruff"
    if name in OWN_CALLS:
        return None if in_memory(call, context) else "own"
    if name in WRAPPERS:
        kinds = {opener(a, context, paths) for a in call.args if isinstance(a, ast.Call)}
        return "ruff" if "ruff" in kinds else ("own" if "own" in kinds else None)
    func = call.func
    if not (isinstance(func, ast.Attribute) and func.attr == "open"):
        return None
    constructed = isinstance(func.value, ast.Call)
    if constructed and dotted_name(func.value.func, context.aliases) in PATH_TYPES:
        return "ruff"
    return "own" if is_path_value(func.value, paths, context.aliases) else None


def opens(call, context, paths):
    kind = opener(call, context, paths)
    return kind == "own" or (kind == "ruff" and in_return(call, context.parents))


def argument_use(parent, context):
    name = dotted_name(parent.func, context.aliases)
    if name in WRAPPERS:
        return None
    last = name.rsplit(".", 1)[-1] if name else getattr(parent.func, "attr", None)
    return "argument" if last in CONSUMERS else None


def in_memory(call, context):
    first = call.args[0] if call.args else None
    if isinstance(first, ast.Constant) and first.value == ":memory:":
        return True
    return isinstance(first, ast.Call) and dotted_name(first.func, context.aliases) in IN_MEMORY


def inline_use(call, context):
    parent = context.parents.get(id(call))
    if isinstance(parent, ast.Attribute) and parent.value is call:
        return None if parent.attr == "close" else "receiver"
    if isinstance(parent, ast.keyword):
        parent = context.parents.get(id(parent))
    if isinstance(parent, ast.Call) and call is not parent.func:
        return argument_use(parent, context)
    if isinstance(parent, (ast.For, ast.AsyncFor, ast.comprehension)):
        return "loop" if parent.iter is call else None
    return None


def subject_of(call, context):
    name = dotted_name(call.func, context.aliases)
    if name is None and isinstance(call.func, ast.Attribute):
        return f"{call.func.attr}()"
    return f"{(name or 'open').rsplit('.', 1)[-1]}()"


def check(context):
    if context.tests:
        return []
    found = []
    paths_by_scope = {}
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        scope = scope_of(node, context.parents)
        if id(scope) not in paths_by_scope:
            paths_by_scope[id(scope)] = annotated_paths(scope, context.aliases)
        if opens(node, context, paths_by_scope[id(scope)]) and inline_use(node, context):
            found.append(finding(context.path, RULE, subject_of(node, context), node))
    return found
