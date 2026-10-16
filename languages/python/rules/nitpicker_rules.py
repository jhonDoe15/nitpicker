import ast
import io
import json
import os
import re
import sys
import tokenize

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "checks"))

import assertion_helpers  # noqa: E402
from collector import Collector  # noqa: E402

DEFAULT_BOUNDARY_ROOTS = ["pydantic", "pydantic_settings"]
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


def read_source(path):
    try:
        with tokenize.open(path) as handle:
            text = handle.read()
        return text, ast.parse(text)
    except (OSError, SyntaxError, UnicodeDecodeError, ValueError):
        return None


def check_file(path, source, settings):
    stubs = stub_findings(path)
    if source is None:
        return stubs
    text, tree = source
    collector = Collector(path, tree, settings)
    collector.visit(tree)
    collector.check_module_constants(tree)
    collector.check_tests(tree)
    return stubs + collector.findings + suppression_findings(path, text)


def load_settings(arguments):
    if len(arguments) < 3:
        return {}
    with open(arguments[2], encoding="utf-8") as handle:
        return json.load(handle)


def project_settings(sources, configured):
    trees = {path: source[1] for path, source in sources.items() if source is not None}
    return {
        "boundary_roots": configured.get("boundary_roots", DEFAULT_BOUNDARY_ROOTS),
        "assertion_helpers": assertion_helpers.assertion_helpers(trees),
    }


def main(arguments):
    list_file, out_file = arguments[:2]
    configured = load_settings(arguments)
    with open(list_file, encoding="utf-8") as handle:
        paths = [line.strip() for line in handle if line.strip()]
    sources = {path: read_source(path) for path in paths}
    settings = project_settings(sources, configured)
    findings = []
    for path in paths:
        findings.extend(check_file(path, sources[path], settings))
    findings.sort(
        key=lambda item: (item["path"], item["line"], item["rule"], item["subject"])
    )
    with open(out_file, "w", encoding="utf-8") as handle:
        json.dump(findings, handle)


if __name__ == "__main__":
    main(sys.argv[1:])

