import ast

from checks.common import dotted_name, last_name

TLS_CONTEXT_CALLS = {"load_verify_locations", "load_cert_chain", "load_default_certs"}
PATH_FILE_CALLS = {"read_text", "read_bytes", "write_text", "write_bytes"}
LOCK_FACTORIES = {
    "threading.Lock",
    "threading.RLock",
    "threading.Semaphore",
    "threading.BoundedSemaphore",
    "threading.Condition",
    "filelock.FileLock",
    "filelock.SoftFileLock",
    "filelock.UnixFileLock",
}
FILE_LOCKS = {"filelock.FileLock", "filelock.SoftFileLock", "filelock.UnixFileLock"}
ASYNC_FILE_LIBRARIES = {"anyio", "trio", "aiopath", "aiofiles"}
FRAMEWORK_GETTERS = {"get_connection"}
FRAMEWORK_ROOTS = ("airflow",)


def imports(context, root):
    values = list(context.aliases[0].values()) + list(context.aliases[1].values())
    return any(value == root or value.startswith(root + ".") for value in values)


def tls_label(call, context):
    name = dotted_name(call.func, context.aliases)
    if name == "ssl.create_default_context":
        if any(keyword.arg in {"cafile", "capath"} for keyword in call.keywords) or len(call.args) > 1:
            return name
        return None
    if isinstance(call.func, ast.Attribute) and call.func.attr in TLS_CONTEXT_CALLS:
        return call.func.attr if imports(context, "ssl") else None
    return None


def async_origin(node, context):
    while isinstance(node, (ast.Call, ast.Attribute, ast.BinOp)):
        if isinstance(node, ast.BinOp):
            node = node.left
        elif isinstance(node, ast.Call):
            dotted = dotted_name(node.func, context.aliases) or ""
            if dotted.split(".")[0] in ASYNC_FILE_LIBRARIES:
                return True
            node = node.func
        else:
            node = node.value
    return isinstance(node, ast.Name) and (context.aliases[0].get(node.id) or "").split(".")[0] in ASYNC_FILE_LIBRARIES


def path_label(call, context):
    func = call.func
    if isinstance(func, ast.Attribute) and func.attr in PATH_FILE_CALLS:
        if async_origin(func.value, context):
            return None
        return func.attr if imports(context, "pathlib") else None
    return None


def blocking_acquire(call):
    if call.args and isinstance(call.args[0], ast.Constant) and call.args[0].value is False:
        return False
    for keyword in call.keywords:
        if keyword.arg == "timeout":
            return False
        if keyword.arg == "blocking" and isinstance(keyword.value, ast.Constant) and keyword.value.value is False:
            return False
    return True


def lock_names(context):
    return context.project.memo(("lock-names", context.path), lambda _: find_lock_names(context))


def find_lock_names(context):
    names = set()
    for node in ast.walk(context.tree):
        if isinstance(node, (ast.Assign, ast.AnnAssign)) and isinstance(node.value, ast.Call):
            if dotted_name(node.value.func, context.aliases) in LOCK_FACTORIES:
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                names.update(filter(None, (last_name(target) for target in targets)))
    return names


def is_lock(node, context):
    if isinstance(node, ast.Call):
        return dotted_name(node.func, context.aliases) in FILE_LOCKS
    return last_name(node) in lock_names(context) and last_name(node) is not None


def lock_text(node, context):
    if isinstance(node, ast.Call):
        return dotted_name(node.func, context.aliases) or "lock"
    return ast.unparse(node)


def acquire_label(call, context):
    func = call.func
    if isinstance(func, ast.Attribute) and func.attr == "acquire" and blocking_acquire(call):
        if not is_lock(func.value, context):
            return None
        return lock_text(func.value, context) + ".acquire"
    return None


def with_label(node, context):
    if not isinstance(node, ast.With):
        return None
    for item in node.items:
        if is_lock(item.context_expr, context):
            return lock_text(item.context_expr, context) + ".acquire"
    return None


def configured_getters(context):
    return set(context.options.get("blockingGetters") or [])


def getter_label(call, context):
    func = call.func
    configured = configured_getters(context)
    dotted = dotted_name(func, context.aliases) or ""
    if dotted in configured or (isinstance(func, ast.Attribute) and func.attr in configured):
        return ast.unparse(func)
    if isinstance(func, ast.Attribute) and func.attr in FRAMEWORK_GETTERS:
        if any(imports(context, root) for root in FRAMEWORK_ROOTS):
            return ast.unparse(func)
    return None
