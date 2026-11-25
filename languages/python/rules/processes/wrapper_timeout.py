import ast
import math
import os
import re

from checks.common import dotted_name, finding, own_nodes
from processes.subprocess_calls import (
    ASYNC_EXEC_CALLS,
    ASYNC_OPEN_CALLS,
    ASYNC_RUN_CALLS,
    ASYNC_SHELL_CALLS,
    POPEN_CALLS,
    RUN_CALLS,
    command_elements,
    command_node,
    is_shell_true,
    resolve_expr,
    subprocess_calls,
)
from processes.timeouts import in_deadline
from security.resolve.booleans import is_none
from security.resolve.calls import argument, keyword_entries
from security.resolve.scopes import where_of
from security.support import exempt

RULE = "wrapper-only-timeout"
GUARDED = True
LAUNCHERS = {
    "sh",
    "bash",
    "zsh",
    "dash",
    "ksh",
    "cmd",
    "cmd.exe",
    "powershell",
    "powershell.exe",
    "pwsh",
    "npx",
    "npx.cmd",
    "gradlew.bat",
    "mvnw.cmd",
}
POSIX_SHELLS = {"sh", "bash", "zsh", "dash", "ksh"}
PACKAGE_MANAGERS = {"npm", "npm.cmd", "yarn", "yarn.cmd", "pnpm", "pnpm.cmd"}
SCRIPT_RUNS = {
    "run",
    "run-script",
    "rum",
    "urn",
    "exec",
    "x",
    "dlx",
    "test",
    "tst",
    "t",
    "start",
    "stop",
    "restart",
}
VALUE_FLAGS = {
    "--filter",
    "-F",
    "--dir",
    "-C",
    "--prefix",
    "--cwd",
    "-w",
    "--workspace",
}
SCRIPT_EXT = re.compile(r"\.(?:sh|bat|cmd|ps1)$", re.IGNORECASE)
SHORT_FLAGS = re.compile(r"^-[a-z]+$")
COMPOUND = re.compile(r"&&|\|\||[;|&\n`]|\$\(")
QUOTED = re.compile(r"'[^']*'|\"[^\"]*\"")
REDIRECT = re.compile(r"\d*>&\d+|&>")
GROUP_KILL = re.compile(r"killpg|os\.kill\(\s*-|taskkill|CTRL_BREAK_EVENT", re.IGNORECASE)
SESSION_FUNCS = {"os.setsid", "os.setpgrp", "setsid", "setpgrp"}
POPEN_WAITS = {"wait": 0, "communicate": 1}
ASYNC_WAITS = {"wait", "communicate"}


def base_name(command):
    return os.path.basename(command.replace("\\", "/"))


def is_launcher(command):
    if not command:
        return False
    name = base_name(command)
    return name.lower() in LAUNCHERS or SCRIPT_EXT.search(name) is not None


def is_compound(text):
    cleaned = REDIRECT.sub(" ", QUOTED.sub(" ", text))
    return COMPOUND.search(cleaned) is not None


def runs_script(tokens):
    for index, token in enumerate(tokens):
        if token.startswith("-"):
            continue
        if index > 0 and tokens[index - 1] in VALUE_FLAGS:
            continue
        return token in SCRIPT_RUNS
    return False


def starts_wrapper(command, tokens):
    if command and base_name(command).lower() in PACKAGE_MANAGERS:
        return runs_script(tokens)
    return is_launcher(command)


def script_wraps(script):
    if not (script and script.strip()):
        return False
    parts = script.strip().split()
    return is_compound(script) or starts_wrapper(parts[0], parts[1:])


def file_wrapper(command, tokens):
    if not (command and starts_wrapper(command, tokens)):
        return None
    if base_name(command) not in POSIX_SHELLS:
        return f"`{command}`"
    flag = next(
        (i for i, token in enumerate(tokens) if SHORT_FLAGS.match(token) and "c" in token),
        -1,
    )
    if flag == -1:
        wraps = any(not token.startswith("-") for token in tokens)
    else:
        script = tokens[flag + 1] if flag + 1 < len(tokens) else None
        wraps = script_wraps(script)
    return f"`{command}`" if wraps else None


def shell_wrapper(text):
    if not text:
        return None
    if is_compound(text):
        return "a shell"
    parts = text.strip().split()
    return file_wrapper(parts[0], parts[1:]) if parts else None


def scalar_number(node, where):
    resolved, _ = resolve_expr(node, where)
    if (
        isinstance(resolved, ast.Constant)
        and isinstance(resolved.value, (int, float))
        and not isinstance(resolved.value, bool)
    ):
        return float(resolved.value)
    return None


def constant_number(node, where):
    direct = scalar_number(node, where)
    if direct is not None:
        return direct
    resolved, _ = resolve_expr(node, where)
    if isinstance(resolved, ast.BinOp) and isinstance(resolved.op, ast.Mult):
        left = scalar_number(resolved.left, where)
        right = scalar_number(resolved.right, where)
        if left is not None and right is not None:
            return left * right
    return None


def positive_timeout(value, where):
    if value is None or is_none(value, where):
        return False
    limit = constant_number(value, where)
    if limit is None:
        return True
    return math.isfinite(limit) and limit > 0


def call_has_timeout(call, where):
    entries = keyword_entries(call.keywords, where)
    for key, value, place in entries.items:
        if key == "timeout":
            return positive_timeout(value, place)
    return False


def string_text(node, where):
    resolved, _ = resolve_expr(node, where)
    if isinstance(resolved, ast.Constant) and isinstance(resolved.value, str):
        return resolved.value
    if isinstance(resolved, ast.JoinedStr):
        parts = [
            part.value if isinstance(part, ast.Constant) and isinstance(part.value, str) else " X "
            for part in resolved.values
        ]
        return "".join(parts)
    return None


def token_list(call, name, where):
    elements, added = command_elements(call, name, where)
    if added:
        return None
    tokens = []
    for element, place in elements:
        if isinstance(element, ast.Starred):
            return None
        text = string_text(element, place)
        if text is None:
            tokens.append("")
        else:
            tokens.append(text)
    return tokens


def wrapper_of(call, name, where):
    if name in ASYNC_SHELL_CALLS or is_shell_true(call, where):
        text = string_text(command_node(call, name), where)
        if text is not None:
            return shell_wrapper(text)
    tokens = token_list(call, name, where)
    if tokens:
        return file_wrapper(tokens[0], tokens[1:])
    if name not in ASYNC_EXEC_CALLS and is_shell_true(call, where):
        text = string_text(command_node(call, name), where)
        if text and is_compound(text):
            return "a shell"
    return None


def starts_new_group(call, where):
    entries = keyword_entries(call.keywords, where)
    for key, value, place in entries.items:
        resolved, rplace = resolve_expr(value, place)
        if key == "start_new_session" and isinstance(resolved, ast.Constant) and resolved.value is True:
            return True
        if key == "preexec_fn" and (dotted_name(resolved, rplace.context.aliases) or "") in SESSION_FUNCS:
            return True
        if key == "creationflags" and "CREATE_NEW_PROCESS_GROUP" in ast.unparse(resolved):
            return True
    return False


def kills_group(call, where):
    if not starts_new_group(call, where):
        return False
    scope = where.scope if where.scope is not None else where.context.tree
    return GROUP_KILL.search(ast.unparse(scope)) is not None


def timed_popen_vars(scope, context):
    timed = set()
    for node in own_nodes(scope):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
            continue
        attr = node.func.attr
        owner = node.func.value
        if attr in POPEN_WAITS:
            timeout = argument(node, POPEN_WAITS[attr], "timeout")
            if positive_timeout(timeout, where_of(node, context)):
                if isinstance(owner, ast.Name):
                    timed.add(owner.id)
                elif isinstance(owner, ast.Call):
                    timed.add(id(owner))
        if attr in ASYNC_WAITS and in_deadline(node, where_of(node, context)):
            if isinstance(owner, ast.Name):
                timed.add(owner.id)
            elif isinstance(owner, ast.Call):
                timed.add(id(owner))
    return timed


def bound_var_name(node, context):
    parent = context.parents.get(id(node))
    if isinstance(parent, ast.Await):
        node = parent
        parent = context.parents.get(id(node))
    if isinstance(parent, ast.Assign) and len(parent.targets) == 1 and isinstance(parent.targets[0], ast.Name):
        return parent.targets[0].id
    if isinstance(parent, ast.AnnAssign) and isinstance(parent.target, ast.Name):
        return parent.target.id
    if isinstance(parent, ast.withitem) and isinstance(parent.optional_vars, ast.Name):
        return parent.optional_vars.id
    return None


def call_is_timed(node, call, name, where, timed_vars):
    if name in RUN_CALLS:
        return call_has_timeout(call, where)
    if name in ASYNC_RUN_CALLS:
        return in_deadline(node, where)
    if name in (POPEN_CALLS | ASYNC_EXEC_CALLS | ASYNC_SHELL_CALLS | ASYNC_OPEN_CALLS):
        if id(node) in timed_vars:
            return True
        var = bound_var_name(node, where.context)
        if var is not None and var in timed_vars:
            return True
        return in_deadline(node, where) and name not in POPEN_CALLS
    return False


def check(context):
    if exempt(context):
        return []
    timed_cache = {}
    found = []
    for node, call, where, name in subprocess_calls(context):
        scope = where.scope if where.scope is not None else context.tree
        if id(scope) not in timed_cache:
            timed_cache[id(scope)] = timed_popen_vars(scope, context)
        if not call_is_timed(node, call, name, where, timed_cache[id(scope)]):
            continue
        wrapper = wrapper_of(call, name, where)
        if wrapper is None:
            continue
        if name not in RUN_CALLS and kills_group(call, where):
            continue
        found.append(finding(context.path, RULE, wrapper, node))
    return found
