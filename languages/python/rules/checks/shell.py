import ast
import os

from checks.common import dotted_name, finding

RULE = "shell-command"
SHELLS = {
    "sh",
    "bash",
    "zsh",
    "dash",
    "ksh",
    "fish",
    "csh",
    "tcsh",
    "cmd",
    "powershell",
    "pwsh",
}
COMMAND_FLAGS = {"-c", "/c", "/k", "-command", "-encodedcommand"}
PROCESS_CALLS = (
    "subprocess.",
    "os.exec",
    "os.spawn",
    "os.posix_spawn",
    "pty.spawn",
    "asyncio.create_subprocess_exec",
)
SHELL_FLAG_CALLS = {
    "subprocess.run",
    "subprocess.call",
    "subprocess.check_call",
    "subprocess.check_output",
    "subprocess.Popen",
    "asyncio.create_subprocess_exec",
}
SHELL_CALLS = {"asyncio.create_subprocess_shell"}


def constant_text(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def is_shell_name(text):
    base = os.path.basename(text.replace("\\", "/")).lower()
    return (base[:-4] if base.endswith(".exe") else base) in SHELLS


def runs_through_shell(texts):
    for index, text in enumerate(texts):
        if text is not None and is_shell_name(text):
            return any(
                later is not None
                and later.lower() in {f.lower() for f in COMMAND_FLAGS}
                for later in texts[index + 1 :]
            )
    return False


def argument_sequences(call):
    sequences = [[constant_text(a) for a in call.args]]
    for argument in call.args:
        if isinstance(argument, (ast.List, ast.Tuple)):
            sequences.append([constant_text(e) for e in argument.elts])
    return sequences


def shell_flag(call):
    for keyword in call.keywords:
        if keyword.arg == "shell":
            value = keyword.value
            literal = isinstance(value, ast.Constant)
            return not literal
        if keyword.arg is None and isinstance(keyword.value, ast.Dict):
            for key, value in zip(keyword.value.keys, keyword.value.values):
                if constant_text(key) == "shell" and not (
                    isinstance(value, ast.Constant) and value.value is False
                ):
                    return True
    return False


def call_finding(call, context):
    name = dotted_name(call.func, context.aliases) or ""
    if name in SHELL_CALLS or (
        isinstance(call.func, ast.Attribute) and call.func.attr == "subprocess_shell"
    ):
        return finding(context.path, RULE, name or "subprocess_shell", call)
    if not name.startswith(PROCESS_CALLS):
        return None
    if name in SHELL_FLAG_CALLS and shell_flag(call):
        return finding(context.path, RULE, name, call)
    if any(runs_through_shell(texts) for texts in argument_sequences(call)):
        return finding(context.path, RULE, name, call)
    return None


def check(context):
    if context.tests:
        return []
    found = (
        call_finding(n, context)
        for n in ast.walk(context.tree)
        if isinstance(n, ast.Call)
    )
    return [item for item in found if item is not None]
