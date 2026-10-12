import ast
import io
import json
import re
import sys
import tokenize

TEST_DIRECTORIES = {"tests", "test"}
BOUNDARY_DIRECTORY = "adapters"
PYDANTIC_ROOTS = {"pydantic", "pydantic_settings"}
MIN_CLASS_CONSTANTS = 2
MIN_MODULE_CONSTANTS = 3
CONSTANT_NAME = re.compile(r"[A-Z][A-Z0-9_]*")
SUPPRESSION = re.compile(
    r"#\s*(?:type:\s*ignore"
    r"|noqa\b"
    r"|(?:ruff|flake8):\s*noqa"
    r"|pyright:\s*(?:ignore|basic|standard|off)\b"
    r"|pyright:\s*report\w+\s*=\s*(?:false|none|warning|information)"
    r"|mypy:\s*(?!strict\b)\S)",
    re.IGNORECASE,
)


def is_test_path(path):
    parts = path.split("/")
    name = parts[-1]
    return (
        bool(TEST_DIRECTORIES.intersection(parts[:-1]))
        or name.startswith("test_")
        or name.endswith("_test.py")
        or name == "conftest.py"
    )


def is_boundary_path(path):
    return BOUNDARY_DIRECTORY in path.split("/")[:-1]


def decorator_name(decorator):
    target = decorator.func if isinstance(decorator, ast.Call) else decorator
    if isinstance(target, ast.Name):
        return target.id
    if isinstance(target, ast.Attribute):
        return target.attr
    return None


def is_frozen(decorator):
    return isinstance(decorator, ast.Call) and any(
        keyword.arg == "frozen"
        and isinstance(keyword.value, ast.Constant)
        and keyword.value.value is True
        for keyword in decorator.keywords
    )


def string_constant_names(body):
    names = []
    for statement in body:
        if isinstance(statement, ast.Assign) and len(statement.targets) == 1:
            target, value = statement.targets[0], statement.value
        elif isinstance(statement, ast.AnnAssign):
            target, value = statement.target, statement.value
        else:
            continue
        if (
            isinstance(target, ast.Name)
            and CONSTANT_NAME.fullmatch(target.id)
            and isinstance(value, ast.Constant)
            and isinstance(value.value, str)
        ):
            names.append(target.id)
    return names


def is_plain_class(node):
    bases = [base for base in node.bases if not (isinstance(base, ast.Name) and base.id == "object")]
    return not bases and not node.keywords and not node.decorator_list


class Collector(ast.NodeVisitor):
    def __init__(self, path):
        self.path = path
        self.scope = []
        self.findings = []
        self.tests = is_test_path(path)
        self.boundary = is_boundary_path(path)

    def add(self, rule, subject, node):
        self.findings.append(
            {"rule": rule, "path": self.path, "subject": subject, "line": node.lineno}
        )

    def visit_scope(self, node):
        self.scope.append(node.name)
        self.generic_visit(node)
        self.scope.pop()

    visit_FunctionDef = visit_scope
    visit_AsyncFunctionDef = visit_scope

    def visit_ClassDef(self, node):
        self.scope.append(node.name)
        subject = ".".join(self.scope)
        self.check_dataclass(node, subject)
        if is_plain_class(node) and len(string_constant_names(node.body)) >= MIN_CLASS_CONSTANTS:
            self.add("enum-string-constants", subject, node)
        self.generic_visit(node)
        self.scope.pop()

    def check_dataclass(self, node, subject):
        for decorator in node.decorator_list:
            if decorator_name(decorator) == "dataclass" and not is_frozen(decorator):
                if not self.tests:
                    self.add("frozen-dataclass", subject, node)

    def visit_Import(self, node):
        for alias in node.names:
            self.check_pydantic(alias.name, node)

    def visit_ImportFrom(self, node):
        if node.level == 0 and node.module:
            self.check_pydantic(node.module, node)

    def check_pydantic(self, module, node):
        outside = not (self.boundary or self.tests)
        if outside and module.split(".")[0] in PYDANTIC_ROOTS:
            self.add("pydantic-boundary", module, node)

    def check_module_constants(self, tree):
        groups = {}
        for statement in tree.body:
            for name in string_constant_names([statement]):
                if "_" in name:
                    groups.setdefault(name.split("_", 1)[0], []).append(statement)
        for prefix in sorted(groups):
            if len(groups[prefix]) >= MIN_MODULE_CONSTANTS:
                self.add("enum-string-constants", prefix + "_*", groups[prefix][0])


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


def check_file(path):
    try:
        with tokenize.open(path) as handle:
            text = handle.read()
        tree = ast.parse(text)
    except (OSError, SyntaxError, UnicodeDecodeError, ValueError):
        return []
    collector = Collector(path)
    collector.visit(tree)
    collector.check_module_constants(tree)
    return collector.findings + suppression_findings(path, text)


def main(arguments):
    list_file, out_file = arguments
    with open(list_file, encoding="utf-8") as handle:
        paths = [line.strip() for line in handle if line.strip()]
    findings = []
    for path in paths:
        findings.extend(check_file(path))
    findings.sort(key=lambda item: (item["path"], item["line"], item["rule"], item["subject"]))
    with open(out_file, "w", encoding="utf-8") as handle:
        json.dump(findings, handle)


if __name__ == "__main__":
    main(sys.argv[1:])
