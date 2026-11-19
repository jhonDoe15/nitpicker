import ast

from checks.common import dotted_name, finding, last_name, own_nodes

PROGRAM_CALLS = {"subprocess.run", "subprocess.call", "os.system"}
COMMAND_MODULES = ("click", "typer")
COMMAND_NAMES = {"command", "group", "callback"}
FLAGS = {"success", "ok", "succeeded"}
REPORTS = {"print", "echo", "secho", "info", "warning", "error", "exception", "write"}
STATUS_ATTRIBUTES = {"returncode", "check_returncode"}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)


def registered_functions(tree):
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and last_name(node.func) == "set_defaults":
            names.update(
                keyword.value.id
                for keyword in node.keywords
                if keyword.arg == "func" and isinstance(keyword.value, ast.Name)
            )
    return names


def is_command(function, aliases, registered):
    if function.name in registered:
        return True
    for decorator in function.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        dotted = dotted_name(target, aliases) or ""
        if dotted.startswith(COMMAND_MODULES) or last_name(target) in COMMAND_NAMES:
            return True
    return False


def has_check(call):
    return any(keyword.arg == "check" for keyword in call.keywords)


def program_call(node, aliases):
    if not isinstance(node, ast.Call) or has_check(node):
        return None
    dotted = dotted_name(node.func, aliases)
    return dotted if dotted in PROGRAM_CALLS else None


def status_read(function, name, dotted):
    for node in own_nodes(function):
        if (
            isinstance(node, ast.Attribute)
            and node.attr in STATUS_ATTRIBUTES
            and ast.unparse(node.value) == name
        ):
            return True
        if (
            dotted != "subprocess.run"
            and isinstance(node, ast.Name)
            and node.id == name
            and isinstance(node.ctx, ast.Load)
        ):
            return True
    return False


def discarded_programs(function, context):
    for node in own_nodes(function):
        if isinstance(node, ast.Expr):
            dotted = program_call(node.value, context.aliases)
            if dotted:
                yield node, dotted
        elif isinstance(node, ast.Assign) and len(node.targets) == 1:
            dotted = program_call(node.value, context.aliases)
            target = node.targets[0]
            if (
                dotted
                and isinstance(target, ast.Name)
                and not status_read(function, target.id, dotted)
            ):
                yield node, dotted


def only_reports(block):
    return bool(block) and all(
        isinstance(item, ast.Expr)
        and isinstance(item.value, ast.Call)
        and last_name(item.value.func) in REPORTS
        for item in block
    )


def failure_flag(node):
    test, negated = node.test, False
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        test, negated = test.operand, True
    if isinstance(test, ast.Attribute) and test.attr in FLAGS:
        return test, (node.body if negated else node.orelse)
    return None, []


def uses_flag_in_exit(function, node, text):
    for other in own_nodes(function):
        if other is node or not isinstance(other, (ast.Return, ast.Raise, ast.Expr)):
            continue
        if text in ast.unparse(other) and (
            isinstance(other, (ast.Return, ast.Raise)) or "exit" in ast.unparse(other)
        ):
            return True
    return False


def printed_flags(function):
    for node in own_nodes(function):
        if isinstance(node, ast.If):
            flag, failure = failure_flag(node)
            text = ast.unparse(flag) if flag is not None else ""
            if (
                flag is not None
                and only_reports(failure)
                and not uses_flag_in_exit(function, node, text)
            ):
                yield node, text


def command_findings(context, rule):
    registered = registered_functions(context.tree)
    found = []
    for function in ast.walk(context.tree):
        if not isinstance(function, FUNCTIONS):
            continue
        if not is_command(function, context.aliases, registered):
            continue
        for node, dotted in discarded_programs(function, context):
            found.append(finding(context.path, rule, f"{dotted}()|returncode", node))
        for node, text in printed_flags(function):
            found.append(finding(context.path, rule, f"{text}|flag", node))
    return found
