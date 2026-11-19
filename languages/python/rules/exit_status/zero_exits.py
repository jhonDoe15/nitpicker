import ast

from checks.common import dotted_name, finding, is_log_call, last_name

EXIT_CALLS = {"sys.exit", "exit", "quit"}
CLEAN_EXITS = {
    "KeyboardInterrupt",
    "SystemExit",
    "BrokenPipeError",
    "EOFError",
    "Abort",
    "Exit",
    "CancelledError",
    "ImportError",
    "ModuleNotFoundError",
}
HANDLER_POSITION = 1
SIGNAL_REGISTRARS = {"signal.signal", "add_signal_handler"}
ERROR_LOGS = {"error", "exception", "critical", "fatal"}
BLOCK_FIELDS = ("body", "orelse", "finalbody")


def is_zero(arguments):
    if not arguments:
        return True
    only = arguments[0]
    return (
        len(arguments) == 1
        and isinstance(only, ast.Constant)
        and only.value in (0, None)
        and not isinstance(only.value, bool)
    )


def zero_exit(statement, aliases):
    if isinstance(statement, ast.Raise) and statement.exc is not None:
        exc = statement.exc
        call = exc if isinstance(exc, ast.Call) else None
        name = last_name(call.func if call else exc)
        arguments = call.args if call else []
        return name == "SystemExit" and is_zero(arguments)
    if isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call):
        call = statement.value
        return dotted_name(call.func, aliases) in EXIT_CALLS and is_zero(call.args)
    return False


def writes_to_stderr(call):
    for keyword in call.keywords:
        if keyword.arg == "file" and "stderr" in ast.unparse(keyword.value):
            return True
        if keyword.arg == "err" and ast.unparse(keyword.value) == "True":
            return True
    return False


def error_output(statement, aliases):
    if not isinstance(statement, ast.Expr) or not isinstance(statement.value, ast.Call):
        return False
    call = statement.value
    if is_log_call(call, aliases):
        return call.func.attr in ERROR_LOGS
    return last_name(call.func) in {"print", "echo", "secho"} and writes_to_stderr(call)


def handler_is_clean(handler):
    kinds = handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    names = {last_name(kind) for kind in kinds if kind is not None}
    return bool(names) and names <= CLEAN_EXITS


def blocks(tree):
    for node in ast.walk(tree):
        for field in BLOCK_FIELDS:
            block = getattr(node, field, None)
            if isinstance(block, list) and block and isinstance(block[0], ast.stmt):
                yield node, block


def signal_handlers(tree, aliases):
    names = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or len(node.args) <= HANDLER_POSITION:
            continue
        registrar = dotted_name(node.func, aliases) or last_name(node.func)
        handler = node.args[HANDLER_POSITION]
        if registrar in SIGNAL_REGISTRARS and isinstance(handler, ast.Name):
            names.add(handler.id)
    return names


def enclosing_function(context, node):
    parent = context.parents.get(id(node))
    while parent is not None:
        if isinstance(parent, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return parent
        parent = context.parents.get(id(parent))
    return None


def exit_findings(context, rule):
    found = []
    handlers = signal_handlers(context.tree, context.aliases)
    for owner, block in blocks(context.tree):
        clean = isinstance(owner, ast.ExceptHandler) and handler_is_clean(owner)
        for index, statement in enumerate(block):
            if not zero_exit(statement, context.aliases):
                continue
            function = enclosing_function(context, statement)
            if function is not None and function.name in handlers:
                continue
            reason = None
            if isinstance(owner, ast.ExceptHandler) and not clean:
                reason = "except"
            elif index and error_output(block[index - 1], context.aliases):
                reason = "error-output"
            if reason is not None:
                subject = f"{ast.unparse(statement)}|{reason}"
                found.append(finding(context.path, rule, subject, statement))
    return found
