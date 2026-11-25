import ast

from checks.common import dotted_name, own_nodes
from security.resolve.booleans import is_none
from security.resolve.calls import PARTIALS, argument, effective_calls, keyword_entries
from security.resolve.scopes import values_of, where_of

RUN_CALLS = {
    "subprocess.run",
    "subprocess.call",
    "subprocess.check_call",
    "subprocess.check_output",
}
POPEN_CALLS = {"subprocess.Popen"}
ASYNC_EXEC_CALLS = {
    "asyncio.create_subprocess_exec",
    "asyncio.subprocess.create_subprocess_exec",
}
ASYNC_SHELL_CALLS = {
    "asyncio.create_subprocess_shell",
    "asyncio.subprocess.create_subprocess_shell",
}
ASYNC_RUN_CALLS = {"anyio.run_process", "trio.run_process"}
ASYNC_OPEN_CALLS = {"anyio.open_process", "trio.lowlevel.open_process"}
NO_TIMEOUT_CALLS = {"subprocess.getoutput", "subprocess.getstatusoutput"}
RESULT_CALLS = {"subprocess.run", "anyio.run_process", "trio.run_process"}
FILE_PROCESS_CALLS = RUN_CALLS | POPEN_CALLS | ASYNC_RUN_CALLS | ASYNC_OPEN_CALLS
ALL_SUBPROCESS_CALLS = (
    FILE_PROCESS_CALLS | ASYNC_EXEC_CALLS | ASYNC_SHELL_CALLS | NO_TIMEOUT_CALLS
)
LISTING_CALLS = {
    "os.listdir",
    "os.scandir",
    "os.walk",
    "glob.glob",
    "glob.iglob",
}
LISTING_METHODS = {"glob", "rglob", "iterdir"}
PATH_FACTORIES = {
    "pathlib.Path",
    "Path",
    "pathlib.PosixPath",
    "pathlib.WindowsPath",
    "pathlib.PurePath",
    "pathlib.Path.cwd",
    "pathlib.Path.home",
    "Path.cwd",
    "Path.home",
}
PATH_HINT_NAMES = {
    "path",
    "root",
    "dir",
    "directory",
    "folder",
    "src",
    "base",
    "repo",
    "project",
    "target",
    "cwd",
    "workdir",
    "workspace",
}
PASS_WRAPPERS = {"list", "tuple", "sorted", "reversed", "set", "iter"}
TEXT_METHODS = {"decode", "strip", "lstrip", "rstrip"}
MAX_RESOLVE = 8


def subprocess_calls(context):
    for node, call, where, through in effective_calls(context, where_of):
        if through and dotted_name(node.func, context.aliases) in PARTIALS:
            continue
        name = dotted_name(call.func, where.context.aliases) or ""
        if name in ALL_SUBPROCESS_CALLS:
            yield node, call, where, name


def resolve_expr(node, where):
    if node is None:
        return node, where
    visited = set()
    current, place = node, where
    depth = 0
    while depth <= MAX_RESOLVE:
        if isinstance(current, ast.Await):
            current = current.value
            depth += 1
            continue
        if isinstance(current, ast.Name) and id(current) not in visited:
            visited.add(id(current))
            values = values_of(current.id, place)
            if len(values) == 1:
                current, place = values[0]
                depth += 1
                continue
        break
    return current, place


def is_shell_true(call, where):
    entries = keyword_entries(call.keywords, where)
    for key, value, place in entries.items:
        if key == "shell":
            resolved, _ = resolve_expr(value, place)
            if isinstance(resolved, ast.Constant):
                return bool(resolved.value)
            return not is_none(resolved, place)
    return False


def command_node(call, name):
    if name in ASYNC_EXEC_CALLS:
        return None
    return argument(call, 0, "args")


def flatten_list_expr(node, where):
    if node is None:
        return [], []
    elements = []
    added = []
    stack = [(node, where, 0)]
    while stack:
        current, place, depth = stack.pop()
        if depth > MAX_RESOLVE or current is None:
            continue
        resolved, rplace = resolve_expr(current, place)
        if isinstance(resolved, (ast.List, ast.Tuple)):
            elements.extend((el, rplace) for el in resolved.elts)
        elif isinstance(resolved, ast.BinOp) and isinstance(resolved.op, ast.Add):
            stack.append((resolved.right, rplace, depth + 1))
            stack.append((resolved.left, rplace, depth + 1))
        elif depth > 0:
            added.append((resolved, rplace))
    return elements, added


def command_elements(call, name, where):
    if name in ASYNC_EXEC_CALLS:
        return [(arg, where) for arg in call.args], []
    cmd = command_node(call, name)
    if cmd is None:
        return [], []
    return flatten_list_expr(cmd, where)


def collect_string_exprs(node, where):
    found = []
    stack = [(node, where, 0)]
    while stack:
        current, place, depth = stack.pop()
        if depth > MAX_RESOLVE or current is None:
            continue
        resolved, rplace = resolve_expr(current, place)
        if isinstance(resolved, ast.JoinedStr):
            found.extend(
                (part.value, rplace)
                for part in resolved.values
                if isinstance(part, ast.FormattedValue)
            )
        elif isinstance(resolved, ast.BinOp) and isinstance(resolved.op, ast.Add):
            stack.append((resolved.right, rplace, depth + 1))
            stack.append((resolved.left, rplace, depth + 1))
        elif (
            isinstance(resolved, ast.Call)
            and isinstance(resolved.func, ast.Attribute)
            and resolved.func.attr == "format"
        ):
            found.extend((arg, rplace) for arg in resolved.args)
            found.extend((kw.value, rplace) for kw in resolved.keywords)
        elif isinstance(resolved, ast.BinOp) and isinstance(resolved.op, ast.Mod):
            right = resolved.right
            if isinstance(right, ast.Tuple):
                found.extend((el, rplace) for el in right.elts)
            else:
                found.append((right, rplace))
    return found


def shell_expressions(call, name, where):
    if name in (ASYNC_SHELL_CALLS | NO_TIMEOUT_CALLS) or is_shell_true(call, where):
        return collect_string_exprs(command_node(call, name), where)
    return []


def joined_list(node):
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "join"
        and len(node.args) == 1
    ):
        return node.args[0], node.func.value
    return None


def is_pathsep(node, where):
    resolved, place = resolve_expr(node, where)
    dotted = dotted_name(resolved, place.context.aliases) or ""
    return dotted in {"os.pathsep", "os.path.pathsep"}


def is_path_receiver(receiver, where):
    current, place = receiver, where
    for _ in range(MAX_RESOLVE):
        resolved, place = resolve_expr(current, place)
        if isinstance(resolved, ast.BinOp) and isinstance(resolved.op, ast.Div):
            current = resolved.left
            continue
        if isinstance(resolved, ast.Call):
            dotted = dotted_name(resolved.func, place.context.aliases) or ""
            return dotted in PATH_FACTORIES
        if isinstance(resolved, ast.Name):
            if resolved.id in {"self", "cls"}:
                return False
            lowered = resolved.id.lower()
            if lowered in PATH_HINT_NAMES or any(lowered.endswith(f"_{hint}") for hint in PATH_HINT_NAMES):
                return True
            scope = place.scope
            if isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef)):
                for arg in scope.args.posonlyargs + scope.args.args + scope.args.kwonlyargs:
                    if arg.arg == resolved.id and arg.annotation is not None:
                        ann = dotted_name(arg.annotation, place.context.aliases) or ""
                        if ann in PATH_FACTORIES or ann.endswith("Path"):
                            return True
        return False
    return False


def is_listing_call(node, where):
    if not isinstance(node, ast.Call):
        return False
    dotted = dotted_name(node.func, where.context.aliases) or ""
    if dotted in LISTING_CALLS:
        return True
    if isinstance(node.func, ast.Attribute) and node.func.attr in LISTING_METHODS:
        return is_path_receiver(node.func.value, where)
    return False


def is_listing(node, where):
    pending = [(node, where, 0)]
    while pending:
        current, place, depth = pending.pop()
        if current is None or depth > MAX_RESOLVE:
            continue
        resolved, rplace = resolve_expr(current, place)
        if resolved is None:
            continue
        if is_listing_call(resolved, rplace):
            return True
        nxt = depth + 1
        if isinstance(resolved, (ast.ListComp, ast.GeneratorExp, ast.SetComp)):
            pending.extend((gen.iter, rplace, nxt) for gen in resolved.generators)
        elif isinstance(resolved, ast.Call):
            dotted = dotted_name(resolved.func, rplace.context.aliases) or ""
            if dotted in PASS_WRAPPERS and resolved.args:
                pending.append((resolved.args[0], rplace, nxt))
            elif dotted in {"map", "filter", "builtins.map", "builtins.filter"} and len(resolved.args) >= 2:
                pending.append((resolved.args[1], rplace, nxt))
        elif isinstance(resolved, (ast.List, ast.Tuple)):
            pending.extend(
                (el.value, rplace, nxt)
                for el in resolved.elts
                if isinstance(el, ast.Starred)
            )
        elif isinstance(resolved, ast.BinOp) and isinstance(resolved.op, ast.Add):
            pending.append((resolved.left, rplace, nxt))
            pending.append((resolved.right, rplace, nxt))
    return False


def text_base(node):
    current = node
    while True:
        if isinstance(current, ast.BoolOp) and isinstance(current.op, ast.Or):
            current = current.values[0]
            continue
        if isinstance(current, ast.Call):
            if isinstance(current.func, ast.Name) and current.func.id == "str" and current.args:
                current = current.args[0]
                continue
            if isinstance(current.func, ast.Attribute) and current.func.attr in TEXT_METHODS:
                current = current.func.value
                continue
        return current


def scope_reads(name, scope):
    return [
        node
        for node in own_nodes(scope)
        if isinstance(node, ast.Name) and node.id == name and isinstance(node.ctx, ast.Load)
    ]


def single_local_binding(name, scope):
    if isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
        args = scope.args
        params = {a.arg for a in args.posonlyargs + args.args + args.kwonlyargs}
        if args.vararg:
            params.add(args.vararg.arg)
        if args.kwarg:
            params.add(args.kwarg.arg)
        if name in params:
            return None
    found = []
    for node in own_nodes(scope):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    found.append(node.value)
        elif (
            isinstance(node, (ast.AnnAssign, ast.NamedExpr))
            and isinstance(node.target, ast.Name)
            and node.target.id == name
            and node.value is not None
        ):
            found.append(node.value)
    return found[0] if len(found) == 1 else None
