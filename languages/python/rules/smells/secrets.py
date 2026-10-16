import ast
import re

from checks.common import dotted_name, finding, is_log_call, words_of

TOKEN_SHAPES = [
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}"),
    re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}"),
    re.compile(r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----"),
    re.compile(r"\b[rs]k_(?:live|test)_[A-Za-z0-9]{20,}"),
    re.compile(r"\bsk-(?:proj|ant|live|test)-[A-Za-z0-9_-]{20,}"),
]
EMBEDDED_SECRETS = [
    re.compile(r"^[a-z][a-z0-9+.-]*://[^\s/:@]+:([^\s/@]+)@", re.I),
    re.compile(r"^(?:Bearer|Basic|Token)\s+(\S+)$"),
    re.compile(r"[?&;]password=([^&;\s]+)", re.I),
]
PLACEHOLDER = re.compile(
    r"^(?:\*+|x+|<.*>|\[.*\]|\$\{.*\}|\{\{.*\}\}|%s|:\w+|changeme|change-me|todo|example"
    r"|dummy|placeholder|redacted|none|null|undefined|your[-_ ].*)$",
    re.I,
)
ENVIRONMENT_NAME = re.compile(r"^[A-Z][A-Z0-9_]+$")
NAME_PATH = re.compile(r"^[A-Za-z]+(?:[._:/-][A-Za-z]+)+$")
CHARACTER_CLASSES = [
    re.compile(p) for p in (r"[a-z]", r"[A-Z]", r"\d", r"[^A-Za-z0-9]")
]
MINIMUM_LENGTH = 6
SECRET_NAME = re.compile(
    r"(?:password|passwd|pwd|passphrase|secret|token|credentials?|apikey|privatekey|accesskey"
    r"|secretkey|authkey|signingkey|encryptionkey)$"
)
CONSTANT_NAME = re.compile(r"^[A-Z][A-Z0-9_]*$")
STATUS_KEYS = {"has", "is"}
URL_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*://", re.I)
ENVIRONMENT_READERS = {"os.getenv", "os.environ.get"}


def looks_like_secret_value(text):
    if len(text) < MINIMUM_LENGTH or re.search(r"\s", text) or PLACEHOLDER.match(text):
        return False
    if ENVIRONMENT_NAME.match(text) or NAME_PATH.match(text):
        return False
    classes = sum(1 for pattern in CHARACTER_CLASSES if pattern.search(text))
    return (re.search(r"\d", text) and re.search(r"[A-Za-z]", text)) or classes >= 3


def has_credential_shape(text):
    if any(shape.search(text) for shape in TOKEN_SHAPES):
        return True
    for shape in EMBEDDED_SECRETS:
        match = shape.search(text)
        if match and looks_like_secret_value(match.group(1)):
            return True
    return False


def is_secret_name(name):
    joined = "".join(words_of(name))
    return bool(SECRET_NAME.search(re.sub(r"\d", "", joined)))


def is_secret_assignment(text, name):
    if has_credential_shape(text) or URL_SCHEME.match(text):
        return False
    return bool(looks_like_secret_value(text)) and "".join(words_of(text)) != "".join(
        words_of(name)
    )


def literal_strings(node, aliases):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return [node]
    if isinstance(node, ast.BoolOp):
        return [
            leaf for value in node.values for leaf in literal_strings(value, aliases)
        ]
    if isinstance(node, ast.IfExp):
        return literal_strings(node.body, aliases) + literal_strings(
            node.orelse, aliases
        )
    if isinstance(node, ast.Call) and len(node.args) >= 2:
        if dotted_name(node.func, aliases) in ENVIRONMENT_READERS:
            return literal_strings(node.args[1], aliases)
    return []


def target_name(target):
    if isinstance(target, ast.Name):
        return target.id
    if isinstance(target, ast.Attribute):
        return target.attr
    return None


def assignments(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                yield target_name(target), node.value, node
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            yield target_name(node.target), node.value, node
        elif isinstance(node, ast.keyword) and node.arg:
            yield node.arg, node.value, node.value
        elif isinstance(node, ast.Dict):
            for key, value in zip(node.keys, node.values):
                if isinstance(key, ast.Constant) and isinstance(key.value, str):
                    yield key.value, value, value
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            yield from defaults(node)


def defaults(function):
    arguments = function.args
    positional = arguments.posonlyargs + arguments.args
    pairs = list(
        zip(positional[len(positional) - len(arguments.defaults) :], arguments.defaults)
    )
    pairs += [
        (a, d)
        for a, d in zip(arguments.kwonlyargs, arguments.kw_defaults)
        if d is not None
    ]
    for argument, default in pairs:
        yield argument.arg, default, default


def hardcoded_findings(context):
    found = []
    for name, value, node in assignments(context.tree):
        if name is None or not is_secret_name(name):
            continue
        for literal in literal_strings(value, context.aliases):
            if is_secret_assignment(literal.value, name):
                found.append(finding(context.path, "hardcoded-secret", name, literal))
    return found


def shape_findings(context):
    return [
        finding(context.path, "credential-shape", "credential", node)
        for node in ast.walk(context.tree)
        if isinstance(node, ast.Constant)
        and isinstance(node.value, str)
        and has_credential_shape(node.value)
    ]


def own_names(node):
    if isinstance(node, ast.Name):
        return [node.id]
    if isinstance(node, ast.Attribute):
        return [node.attr]
    return []


def logged_children(node):
    if isinstance(node, ast.JoinedStr):
        return [v.value for v in node.values if isinstance(v, ast.FormattedValue)]
    if isinstance(node, ast.Dict):
        return [v for k, v in zip(node.keys, node.values) if k is not None]
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        return list(node.elts)
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Mod)):
        return [node.left, node.right]
    if isinstance(node, ast.BoolOp):
        return list(node.values)
    if isinstance(node, ast.Starred):
        return [node.value]
    if isinstance(node, ast.keyword):
        return [node.value]
    return []


def dictionary_names(node):
    names = []
    if isinstance(node, ast.Dict):
        for key, value in zip(node.keys, node.values):
            if isinstance(key, ast.Constant) and isinstance(key.value, str):
                if own_names(value):
                    names.append(key.value)
    return names


def logged_names(arguments):
    names = []
    pending = list(arguments)
    for node in pending:
        names.extend(own_names(node))
        names.extend(dictionary_names(node))
        pending.extend(logged_children(node))
    return names


def is_status_name(name):
    return (words_of(name) or [""])[0] in STATUS_KEYS


def log_findings(context):
    found = []
    for node in ast.walk(context.tree):
        if not is_log_call(node, context.aliases):
            continue
        names = logged_names(list(node.args) + list(node.keywords))
        secrets = {
            name
            for name in names
            if is_secret_name(name)
            and not CONSTANT_NAME.match(name)
            and not is_status_name(name)
        }
        for name in sorted(secrets):
            found.append(finding(context.path, "secret-in-log", name, node))
    return found


def check(context):
    if context.tests:
        return []
    return hardcoded_findings(context) + shape_findings(context) + log_findings(context)
