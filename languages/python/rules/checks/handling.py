import ast

from checks.common import dotted_name, is_log_call, last_name

REPORT_CALLS = {
    "warnings.warn",
    "traceback.print_exc",
    "traceback.print_exception",
    "print",
    "pprint.pprint",
    "sys.stderr.write",
    "sys.stdout.write",
    "sys.stderr.flush",
    "sys.stdout.flush",
}
EXIT_CALLS = {"sys.exit", "exit", "quit", "os._exit", "os.abort"}
TALLY_METHODS = {
    "append",
    "appendleft",
    "add",
    "extend",
    "extendleft",
    "update",
    "insert",
    "put",
    "put_nowait",
    "setdefault",
}
EMPTY_BUILTINS = {
    "list",
    "dict",
    "set",
    "frozenset",
    "tuple",
    "str",
    "int",
    "float",
    "bool",
    "bytes",
    "object",
}
ALIAS_PASSES = 3
FORMATTERS = {
    "str",
    "repr",
    "format",
    "ascii",
    "type",
    "len",
    "bool",
    "join",
    "isinstance",
}


def names_in(node):
    return {part.id for part in ast.walk(node) if isinstance(part, ast.Name)}


def is_report(call, context, local_reports):
    name = dotted_name(call.func, context.aliases)
    return (
        is_log_call(call, context.aliases)
        or name in REPORT_CALLS
        or (isinstance(call.func, ast.Name) and call.func.id in local_reports)
    )


def is_tally(call):
    return isinstance(call.func, ast.Attribute) and call.func.attr in TALLY_METHODS


def is_empty_builtin(call):
    return (
        isinstance(call.func, ast.Name)
        and call.func.id in EMPTY_BUILTINS
        and not call.args
        and not call.keywords
    )


def reporting_functions(tree, context):
    found = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if all(only_reports(statement, context) for statement in node.body):
                found.add(node.name)
    return found


def only_reports(statement, context):
    if isinstance(statement, ast.Expr):
        value = statement.value
        return isinstance(value, ast.Constant) or (
            isinstance(value, ast.Call) and is_report(value, context, set())
        )
    return isinstance(statement, (ast.Pass, ast.Return)) and (
        not isinstance(statement, ast.Return) or statement.value is None
    )


def walk_handler(handler, context, local_reports):
    pending = list(handler.body)
    while pending:
        node = pending.pop()
        if isinstance(node, ast.Call) and is_report(node, context, local_reports):
            continue
        yield node
        if not isinstance(
            node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)
        ):
            pending.extend(ast.iter_child_nodes(node))


def derived_names(nodes, name):
    names = {name} if name else set()
    assignments = [
        node for node in nodes if isinstance(node, (ast.Assign, ast.AnnAssign))
    ]
    for _ in range(ALIAS_PASSES):
        for node in assignments:
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            if node.value is not None and names_in(node.value) & names:
                names.update(t.id for t in targets if isinstance(t, ast.Name))
    return names


def carries(node, names):
    return node is not None and bool(names_in(node) & names)


def has_call(node):
    return node is not None and any(
        isinstance(part, ast.Call) and not is_empty_builtin(part)
        for part in ast.walk(node)
    )


def call_hands_on(call, names):
    arguments = list(call.args) + [keyword.value for keyword in call.keywords]
    return any(carries(argument, names) for argument in arguments)


def assignment_evidence(node, names):
    targets = node.targets if isinstance(node, ast.Assign) else [node.target]
    if node.value is None:
        return False
    if carries(node.value, names):
        return any(not isinstance(target, ast.Name) for target in targets)
    return has_call(node.value)


def evidence(node, names, context):
    if isinstance(node, (ast.Raise, ast.Break)):
        return True
    if isinstance(node, ast.Call):
        return dotted_name(node.func, context.aliases) in EXIT_CALLS or (
            last_name(node.func) not in FORMATTERS and call_hands_on(node, names)
        )
    if isinstance(node, (ast.Return, ast.Yield, ast.YieldFrom)):
        return carries(node.value, names) or has_call(node.value)
    if isinstance(node, (ast.Assign, ast.AnnAssign)):
        return assignment_evidence(node, names)
    return isinstance(node, ast.AugAssign) and carries(node.value, names)


def action_call(node, context, local_reports):
    value = node.value if isinstance(node, ast.Expr) else None
    if not isinstance(value, ast.Call):
        return False
    return not (is_report(value, context, local_reports) or is_tally(value))


def used_after(scope, handler, alias_names):
    inside = {id(part) for part in ast.walk(handler)}
    return any(
        isinstance(part, ast.Name)
        and part.id in alias_names
        and isinstance(part.ctx, ast.Load)
        and id(part) not in inside
        for part in ast.walk(scope)
    )


def is_handled(handler, context, scope, optional_import):
    local_reports = context.project.memo(
        ("reporting", context.path),
        lambda _: reporting_functions(context.tree, context),
    )
    nodes = list(walk_handler(handler, context, local_reports))
    names = derived_names(nodes, handler.name)
    return (
        any(evidence(node, names, context) for node in nodes)
        or any(action_call(node, context, local_reports) for node in nodes)
        or (
            optional_import
            and any(isinstance(node, (ast.Assign, ast.AnnAssign)) for node in nodes)
        )
        or used_after(scope, handler, names - {handler.name})
    )
