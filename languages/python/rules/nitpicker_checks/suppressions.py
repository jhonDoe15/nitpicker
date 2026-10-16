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


def suppression_findings(path, text):
    findings = []
    try:
        for token in tokenize.generate_tokens(io.StringIO(text).readline):
            if token.type == tokenize.COMMENT and SUPPRESSION.search(token.string):
                subject = " ".join(token.string.lstrip("#").split())
                findings.append(
                    {
                        "rule": "no-inline-suppression",
                        "path": path,
                        "subject": subject,
                        "line": token.start[0],
                    }
                )
    except (tokenize.TokenError, SyntaxError):
        return findings
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
