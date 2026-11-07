import ast

from checks.common import call_name

CONTAINER_PREFIX = "testcontainers."
SERVER_CALLS = {
    "uvicorn.run",
    "uvicorn.Server",
    "hypercorn.asyncio.serve",
    "subprocess.Popen",
    "asyncio.create_subprocess_exec",
    "asyncio.create_subprocess_shell",
    "multiprocessing.Process",
    "http.server.HTTPServer",
    "http.server.ThreadingHTTPServer",
    "socketserver.TCPServer",
    "socketserver.ThreadingTCPServer",
    "werkzeug.serving.make_server",
    "wsgiref.simple_server.make_server",
    "aiohttp.web.run_app",
}
GIT_CALLS = {
    "git.Repo.init",
    "git.Repo.clone_from",
    "pygit2.init_repository",
    "pygit2.clone_repository",
    "dulwich.repo.Repo.init",
    "dulwich.porcelain.init",
    "dulwich.porcelain.clone",
}
PROCESS_RUNS = {
    "subprocess.run",
    "subprocess.call",
    "subprocess.check_call",
    "subprocess.check_output",
}
GIT_CREATES = {"init", "clone"}
GIT_OPTIONS_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree"}
PROCESS_CALLS = {
    "subprocess.Popen",
    "asyncio.create_subprocess_exec",
    "asyncio.create_subprocess_shell",
}
WAITS = {"communicate", "wait"}
CONTAINER_NAMES = ("Container", "DockerCompose")


def literal_words(node):
    if isinstance(node, (ast.List, ast.Tuple)):
        return [
            item.value if isinstance(item, ast.Constant) and isinstance(item.value, str) else ""
            for item in node.elts
        ]
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value.split()
    return []


def command_of(node):
    if node.args:
        return node.args[0]
    return next((item.value for item in node.keywords if item.arg == "args"), None)


def git_subcommand(words):
    skip = False
    for word in words[1:]:
        if skip:
            skip = False
        elif word in GIT_OPTIONS_WITH_VALUE:
            skip = True
        elif not word.startswith("-"):
            return word
    return None


def creates_repository(node):
    words = literal_words(command_of(node))
    return bool(words) and words[0] == "git" and git_subcommand(words) in GIT_CREATES


def is_container(name):
    return name.startswith(CONTAINER_PREFIX) and name.rsplit(".", 1)[-1].endswith(CONTAINER_NAMES)


def heavy_name(node, aliases):
    name = call_name(node, aliases)
    if not name:
        return None
    if is_container(name) or name in SERVER_CALLS or name in GIT_CALLS:
        return name
    if name in PROCESS_RUNS and creates_repository(node):
        return name
    return None


def own_calls(function):
    pending = list(function.body)
    while pending:
        node = pending.pop(0)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
            continue
        if isinstance(node, ast.Call):
            yield node
        pending.extend(ast.iter_child_nodes(node))


def bound_names(function, parents):
    names = {}
    for node in own_calls(function):
        parent = parents.get(id(node))
        if isinstance(parent, ast.Assign):
            targets = parent.targets
        elif isinstance(parent, ast.withitem):
            targets = [parent.optional_vars]
        elif isinstance(parent, ast.Await):
            grand = parents.get(id(parent))
            targets = grand.targets if isinstance(grand, ast.Assign) else []
        else:
            targets = []
        names[id(node)] = {target.id for target in targets if isinstance(target, ast.Name)}
    return names


def waited_names(function):
    return {
        node.func.value.id
        for node in own_calls(function)
        if isinstance(node.func, ast.Attribute)
        and node.func.attr in WAITS
        and isinstance(node.func.value, ast.Name)
    }


def short_lived(node, context, waited, bound):
    parent = context.parents.get(id(node))
    if isinstance(parent, ast.Attribute) and parent.attr in WAITS:
        return True
    return bool(bound.get(id(node), set()) & waited)


def heavy_calls(function, context):
    waited = waited_names(function)
    bound = bound_names(function, context.parents)
    found = [
        (name, node)
        for node in own_calls(function)
        for name in [heavy_name(node, context.aliases)]
        if name and not (name in PROCESS_CALLS and short_lived(node, context, waited, bound))
    ]
    return sorted(found, key=lambda item: (item[1].lineno, item[1].col_offset))


def call_key(node):
    return ast.dump(node, annotate_fields=False, include_attributes=False)
