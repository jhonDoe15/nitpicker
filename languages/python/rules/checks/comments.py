import ast
import io
import os
import re
import tokenize

SUPPRESSION = re.compile(
    r"#\s*(?:type:\s*ignore"
    r"|noqa\b"
    r"|(?:ruff|flake8):\s*noqa"
    r"|pyright:\s*(?:ignore|basic|standard|off)\b"
    r"|pyright:\s*report\w+\s*=\s*(?:false|none|warning|information)"
    r"|fmt:\s*(?:off|skip)\b"
    r"|mypy:\s*(?!strict\b)\S)",
    re.IGNORECASE,
)
TASK_MARKER = re.compile(
    r"(?<![\w./-])(?:TODO|FIXME|XXX|HACK)(?![\w-])(?![./]\w)", re.I
)
MARKER_FOLLOWER = re.compile(r"^[:(]")
REFERENCE = r"#[1-9]\d*|[A-Z][A-Z0-9]+-[1-9]\d*|https?://\S+"
DIRECT_REFERENCE = re.compile(rf"^(?:\(\s*({REFERENCE})\s*\)|:?\s+({REFERENCE}))")
NOT_ISSUE_KEYS = {
    "SHA",
    "UTF",
    "ISO",
    "RFC",
    "MD",
    "AES",
    "RSA",
    "TLS",
    "SSL",
    "HTTP",
    "ES",
    "ECMA",
    "IEEE",
    "CVE",
}
SHOWN_LENGTH = 50


def comments_of(text):
    comments = []
    try:
        for token in tokenize.generate_tokens(io.StringIO(text).readline):
            if token.type == tokenize.COMMENT:
                comments.append((token.string, token.start[0]))
    except (tokenize.TokenError, SyntaxError):
        return comments
    return comments


def is_referenced(rest):
    match = DIRECT_REFERENCE.match(rest)
    reference = match.group(1) or match.group(2) if match else None
    return reference is not None and reference.split("-")[0] not in NOT_ISSUE_KEYS


def has_unreferenced_tag(line):
    for match in TASK_MARKER.finditer(line):
        shouted = match.group(0).isupper()
        follows = (
            shouted or match.start() == 0 or MARKER_FOLLOWER.match(line[match.end() :])
        )
        if follows and not is_referenced(line[match.end() :]):
            return True
    return False


def comment_findings(path, text):
    findings = []
    for comment, line in comments_of(text):
        if SUPPRESSION.search(comment):
            subject = " ".join(comment.lstrip("#").split())
            findings.append(
                {
                    "rule": "no-inline-suppression",
                    "path": path,
                    "subject": subject,
                    "line": line,
                }
            )
        body = comment.lstrip("#").strip()
        if has_unreferenced_tag(body):
            findings.append(
                {
                    "rule": "todo-without-issue",
                    "path": path,
                    "subject": body[:SHOWN_LENGTH],
                    "line": line,
                }
            )
    return findings


def stub_findings(path):
    stub = path[: -len(".py")] + ".pyi" if path.endswith(".py") else None
    if stub is None or not os.path.isfile(stub):
        return []
    return [
        {
            "rule": "stub-beside-source",
            "path": path,
            "subject": os.path.basename(stub),
            "line": 1,
        }
    ]


def docstring_nodes(tree):
    for node in ast.walk(tree):
        if isinstance(
            node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)
        ):
            first = node.body[0] if node.body else None
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
                yield first.value
        elif isinstance(node, ast.Call) and is_not_implemented(node):
            yield from (a for a in node.args if isinstance(a, ast.Constant))


def is_not_implemented(call):
    function = call.func
    name = function.id if isinstance(function, ast.Name) else None
    return name == "NotImplementedError"


def string_findings(path, tree):
    findings = []
    for node in docstring_nodes(tree):
        if not isinstance(node.value, str):
            continue
        for offset, line in enumerate(node.value.splitlines()):
            body = line.strip()
            if has_unreferenced_tag(body):
                findings.append(
                    {
                        "rule": "todo-without-issue",
                        "path": path,
                        "subject": body[:SHOWN_LENGTH],
                        "line": node.lineno + offset,
                    }
                )
    return findings


def check(context):
    return comment_findings(context.path, context.text) + string_findings(
        context.path, context.tree
    )
