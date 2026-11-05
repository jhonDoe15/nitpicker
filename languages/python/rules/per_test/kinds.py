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


def literal_words(node):
    if isinstance(node, (ast.List, ast.Tuple)):
        return [
            item.value
            for item in node.elts
            if isinstance(item, ast.Constant) and isinstance(item.value, str)
        ]
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value.split()
    return []


def creates_repository(node):
    words = literal_words(node.args[0]) if node.args else []
    return len(words) >= 2 and words[0] == "git" and words[1] in GIT_CREATES


def heavy_name(node, aliases):
    name = call_name(node, aliases)
    if not name:
        return None
    if name.startswith(CONTAINER_PREFIX) or name in SERVER_CALLS or name in GIT_CALLS:
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


def heavy_calls(function, aliases):
    return [
        (name, node)
        for node in own_calls(function)
        for name in [heavy_name(node, aliases)]
        if name
    ]


def call_key(node):
    return ast.dump(node, annotate_fields=False, include_attributes=False)
