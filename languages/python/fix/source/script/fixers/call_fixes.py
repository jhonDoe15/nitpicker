import ast
import json
import re
import shlex

from checks.common import LOGGER_FACTORIES, LOGURU_LOGGER, dotted_name, last_name
from fixers.call_edits import (
    add_keyword,
    attribute_rename,
    drop_keyword,
    has_spread,
    keyword_named,
)
from source_text import refuse, replacement, required

HTTP_TIMEOUT_SECONDS = 10
CLIENT_METHODS = {
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options",
    "request",
    "stream",
    "send",
    "urlopen",
    "request_encode_url",
    "request_encode_body",
}
POSITIONAL_TIMEOUTS = ("urllib.request", "six.moves", "http.client")
UNSAFE_LOADS = {
    "yaml.unsafe_load": "safe_load",
    "yaml.full_load": "safe_load",
    "yaml.unsafe_load_all": "safe_load_all",
    "yaml.full_load_all": "safe_load_all",
}
SHELLS = {"sh", "bash", "zsh", "dash", "ksh"}
BUILTINS = {
    "cd",
    "export",
    "source",
    ".",
    "eval",
    "exec",
    "set",
    "unset",
    "alias",
    "ulimit",
    "umask",
    "read",
    "type",
    "command",
    "wait",
    "exit",
    "echo",
    "test",
    "[",
    "true",
    "false",
    "kill",
    "pwd",
    "time",
    "trap",
    "pushd",
    "popd",
    "declare",
    "typeset",
    "local",
    "readonly",
    "let",
    "shift",
    "return",
    "builtin",
}
SHELL_SYNTAX = re.compile(r"[|&;<>()$`\\*?\[\]{}~!#\n\r]")
FALSE_KEYWORDS = {"verify", "ssl"}


def is_false(node):
    return isinstance(node, ast.Constant) and node.value is False


def logged_through_logging(call, context):
    owner = call.func.value
    if isinstance(owner, ast.Call):
        factory = (dotted_name(owner.func, context.aliases) or "").rsplit(".", 1)[-1]
        return factory in LOGGER_FACTORIES
    if dotted_name(owner, context.aliases) in {LOGURU_LOGGER, None}:
        return False
    name = last_name(owner)
    return dotted_name(owner, context.aliases) == "logging" or (
        isinstance(owner, ast.Name) and name in context.aliases[2]
    )


def catch_log(source, node, context):
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
        refuse("not a logging call")
    if not logged_through_logging(node, context):
        refuse("the logger is not provably the standard library logging")
    if has_spread(node) or keyword_named(node, "exc_info") is not None:
        refuse("the call spreads arguments or already names exc_info")
    return [
        required(
            add_keyword(source, node, "exc_info=True"), "the call has comments inside"
        )
    ]


def http_timeout(source, node, context):
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
        refuse("not a client method call")
    name = dotted_name(node.func, context.aliases) or ""
    if node.func.attr not in CLIENT_METHODS or name.startswith(POSITIONAL_TIMEOUTS):
        refuse("the timeout of this call is positional or not a plain keyword")
    if has_spread(node):
        refuse("the call spreads arguments")
    seconds = f"timeout={HTTP_TIMEOUT_SECONDS}"
    option = keyword_named(node, "timeout")
    if option is None:
        return [
            required(add_keyword(source, node, seconds), "the call has comments inside")
        ]
    if not (isinstance(option.value, ast.Constant) and option.value.value is None):
        refuse("the call already sets a timeout the rule cannot read")
    start, end = source.span(option.value)
    return [replacement(start, end, str(HTTP_TIMEOUT_SECONDS))]


def tls_verification(source, node, context):
    if not isinstance(node, ast.Call):
        refuse("not a call")
    name = dotted_name(node.func, context.aliases) or ""
    if name.endswith("partial"):
        refuse("the call builds a partial")
    options = [
        k for k in node.keywords if k.arg in FALSE_KEYWORDS and is_false(k.value)
    ]
    if len(options) != 1:
        refuse("no single literal verify=False or ssl=False keyword")
    return [
        required(
            drop_keyword(source, node, options[0]), "the keyword has comments around it"
        )
    ]


def unsafe_load(source, node, context):
    func = node.func if isinstance(node, ast.Call) else None
    name = dotted_name(func, context.aliases) if func is not None else None
    if not isinstance(func, ast.Attribute) or name not in UNSAFE_LOADS:
        refuse("not a yaml loader call that safe_load replaces")
    if not isinstance(func.value, ast.Name) or has_spread(node):
        refuse("the loader is imported by name or the call spreads arguments")
    if len(node.args) + len(node.keywords) != 1:
        refuse("the call passes more than the stream")
    return [attribute_rename(source, func, UNSAFE_LOADS[name])]


def literal_command(node):
    if not (isinstance(node, ast.Constant) and isinstance(node.value, str)):
        refuse("the command is not a literal")
    text = node.value
    if SHELL_SYNTAX.search(text):
        refuse("the command uses shell syntax")
    try:
        words = shlex.split(text)
    except ValueError:
        refuse("the command has an unbalanced quote")
    if not words or "=" in words[0] or words[0] in BUILTINS:
        refuse("the command starts with an assignment or a shell builtin")
    return words


def quoted(words):
    return ", ".join(json.dumps(word) for word in words)


def shell_array(source, call, argument):
    elements = argument.elts
    texts = [e.value if isinstance(e, ast.Constant) else None for e in elements]
    if len(texts) != 3 or texts[1] != "-c" or not isinstance(texts[2], str):
        refuse("not a shell, -c and a literal command")
    if texts[0].rsplit("/", 1)[-1] not in SHELLS or keyword_named(call, "shell"):
        refuse("not a plain POSIX shell, or the call names shell")
    start, end = source.span(argument)
    return replacement(start, end, f"[{quoted(literal_command(elements[2]))}]")


def shell_command(source, node, context):
    if not isinstance(node, ast.Call) or has_spread(node):
        refuse("not a call, or it spreads arguments")
    name = dotted_name(node.func, context.aliases)
    if name == "asyncio.create_subprocess_shell":
        if not isinstance(node.func, ast.Attribute) or not node.args:
            refuse("the call is imported by name or has no command")
        words = literal_command(node.args[0])
        start, end = source.span(node.args[0])
        return [
            attribute_rename(source, node.func, "create_subprocess_exec"),
            replacement(start, end, quoted(words)),
        ]
    if not name or not name.startswith("subprocess."):
        refuse("not a subprocess call")
    arrays = [a for a in node.args[:1] if isinstance(a, (ast.List, ast.Tuple))]
    if len(arrays) != 1:
        refuse("the command is not a literal argument list")
    return [shell_array(source, node, arrays[0])]
