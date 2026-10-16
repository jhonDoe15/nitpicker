import ast
import io
import json
import os
import re
import sys
import tokenize

TEST_DIRECTORIES = {"tests", "test"}
BOUNDARY_DIRECTORY = "adapters"
PYDANTIC_ROOTS = {"pydantic", "pydantic_settings"}
MIN_CLASS_CONSTANTS = 2
MIN_MODULE_CONSTANTS = 3
TYPE_CHECKING_NAMES = {"typing.TYPE_CHECKING", "typing_extensions.TYPE_CHECKING"}
OPTIONAL_IMPORT_ERRORS = {"ImportError", "ModuleNotFoundError"}
BLIND_ERRORS = {"Exception", "BaseException", "builtins.Exception", "builtins.BaseException"}
CONSTANT_NAME = re.compile(r"[A-Z][A-Z0-9_]*")
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


def is_constant(node):
    if isinstance(node, ast.Constant):
        return True
    if isinstance(node, ast.UnaryOp):
        return is_constant(node.operand)
    if isinstance(node, (ast.Tuple, ast.List, ast.Set)):
        return all(is_constant(element) for element in node.elts)
    if isinstance(node, ast.Dict):
        return all(
            key is not None and is_constant(key) and is_constant(value)
            for key, value in zip(node.keys, node.values)
        )
    return False


def is_optional_import(handler):
    caught = handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    names = {node.id for node in caught if isinstance(node, ast.Name)}
    return len(names) == len(caught) and names <= OPTIONAL_IMPORT_ERRORS


def is_inert(statement, optional_import):
    if isinstance(statement, ast.Return):
        return statement.value is None or is_constant(statement.value)
    if isinstance(statement, ast.Expr):
        return isinstance(statement.value, ast.Constant)
    if isinstance(statement, (ast.Assign, ast.AnnAssign)):
        return not optional_import and statement.value is not None and is_constant(statement.value)
    return isinstance(statement, (ast.Pass, ast.Continue))


def type_text(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return f"{type_text(node.value)}.{node.attr}"
    if isinstance(node, ast.Tuple):
        return "(" + ", ".join(type_text(element) for element in node.elts) + ")"
    return "expression"


def is_test_path(path):
    parts = path.split("/")
    name = parts[-1]
    return (
        bool(TEST_DIRECTORIES.intersection(parts[:-1]))
        or name.startswith("test_")
        or name.endswith("_test.py")
        or name == "tests.py"
        or name == "conftest.py"
    )


def is_boundary_path(path):
    return BOUNDARY_DIRECTORY in path.split("/")[:-1]


def import_aliases(tree):
    names, modules = {}, {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            for alias in node.names:
                names[alias.asname or alias.name] = f"{node.module}.{alias.name}"
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.asname:
                    modules[alias.asname] = alias.name
    return names, modules


def dotted_name(node, aliases):
    names, modules = aliases
    if isinstance(node, ast.Name):
        return names.get(node.id) or modules.get(node.id) or node.id
    if isinstance(node, ast.Attribute):
        base = dotted_name(node.value, aliases)
        return f"{base}.{node.attr}" if base else None
    return None


def decorator_name(decorator, aliases):
    target = decorator.func if isinstance(decorator, ast.Call) else decorator
    name = dotted_name(target, aliases)
    return name.rsplit(".", 1)[-1] if name else None


def is_frozen(decorator):
    return isinstance(decorator, ast.Call) and any(
        keyword.arg == "frozen"
        and isinstance(keyword.value, ast.Constant)
        and keyword.value.value is True
        for keyword in decorator.keywords
    )


def string_constants(body):
    constants = []
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
            constants.append((target.id, value.value))
    return constants


def common_prefix(names):
    prefix = os.path.commonprefix(names)
    return prefix[: prefix.rfind("_") + 1]


def normalized(text):
    return text.lower().replace("-", "_").replace(" ", "_")


def is_enum_like(name, value, prefix):
    return normalized(value) in (normalized(name), normalized(name[len(prefix) :]))


def is_enum_group(constants, prefix):
    return all(is_enum_like(name, value, prefix) for name, value in constants)


def is_plain_class(node):
    bases = [
        base
        for base in node.bases
        if not (isinstance(base, ast.Name) and base.id == "object")
    ]
    return not bases and not node.keywords and not node.decorator_list


class Collector(ast.NodeVisitor):
    def __init__(self, path, aliases):
        self.path = path
        self.aliases = aliases
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
        self.check_no_type_check(node)
        self.generic_visit(node)
        self.scope.pop()

    def check_no_type_check(self, node):
        if any(
            decorator_name(decorator, self.aliases) == "no_type_check"
            for decorator in node.decorator_list
        ):
            self.add("no-type-check", ".".join(self.scope), node)

    def is_type_checking(self, node):
        return dotted_name(node, self.aliases) in TYPE_CHECKING_NAMES or (
            isinstance(node, ast.Name) and node.id == "TYPE_CHECKING"
        )

    def visit_If(self, node):
        if any(
            isinstance(part, ast.UnaryOp)
            and isinstance(part.op, ast.Not)
            and self.is_type_checking(part.operand)
            for part in ast.walk(node.test)
        ):
            self.add("not-type-checking", "if not TYPE_CHECKING", node)
        self.generic_visit(node)

    def visit_ExceptHandler(self, node):
        optional_import = node.type is not None and is_optional_import(node)
        if all(is_inert(statement, optional_import) for statement in node.body):
            caught = type_text(node.type) if node.type else ""
            self.add("swallowed-exception", f"except {caught}".strip(), node)
        self.generic_visit(node)

    def visit_Call(self, node):
        name = dotted_name(node.func, self.aliases)
        if name == "contextlib.suppress" and (
            not node.args
            or any(dotted_name(argument, self.aliases) in BLIND_ERRORS for argument in node.args)
        ):
            arguments = ", ".join(type_text(argument) for argument in node.args)
            self.add("blind-suppress", f"{name}({arguments})", node)
        self.generic_visit(node)

    visit_FunctionDef = visit_scope
    visit_AsyncFunctionDef = visit_scope

    def visit_ClassDef(self, node):
        self.scope.append(node.name)
        subject = ".".join(self.scope)
        self.check_no_type_check(node)
        self.check_dataclass(node, subject)
        self.check_class_constants(node, subject)
        self.generic_visit(node)
        self.scope.pop()

    def check_class_constants(self, node, subject):
        constants = string_constants(node.body)
        if (
            is_plain_class(node)
            and len(constants) >= MIN_CLASS_CONSTANTS
            and is_enum_group(constants, common_prefix([name for name, _ in constants]))
        ):
            self.add("enum-string-constants", subject, node)

    def check_dataclass(self, node, subject):
        for decorator in node.decorator_list:
            if decorator_name(decorator, self.aliases) == "dataclass" and not is_frozen(
                decorator
            ):
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
            for name, value in string_constants([statement]):
                if "_" in name:
                    groups.setdefault(name.split("_", 1)[0], []).append(
                        (statement, name, value)
                    )
        for prefix in sorted(groups):
            members = groups[prefix]
            constants = [(name, value) for _, name, value in members]
            if len(members) >= MIN_MODULE_CONSTANTS and is_enum_group(
                constants, prefix + "_"
            ):
                self.add("enum-string-constants", prefix + "_*", members[0][0])


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


def check_file(path):
    stubs = stub_findings(path)
    try:
        with tokenize.open(path) as handle:
            text = handle.read()
        tree = ast.parse(text)
    except (OSError, SyntaxError, UnicodeDecodeError, ValueError):
        return stubs
    collector = Collector(path, import_aliases(tree))
    collector.visit(tree)
    collector.check_module_constants(tree)
    return stubs + collector.findings + suppression_findings(path, text)


def main(arguments):
    list_file, out_file = arguments
    with open(list_file, encoding="utf-8") as handle:
        paths = [line.strip() for line in handle if line.strip()]
    findings = []
    for path in paths:
        findings.extend(check_file(path))
    findings.sort(
        key=lambda item: (item["path"], item["line"], item["rule"], item["subject"])
    )
    with open(out_file, "w", encoding="utf-8") as handle:
        json.dump(findings, handle)


if __name__ == "__main__":
    main(sys.argv[1:])
