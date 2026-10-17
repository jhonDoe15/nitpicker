import ast
import json
import os
import sys
import tokenize

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from nitpicker_checks.common import (
    decorator_name,
    finding,
    dotted_name,
    import_aliases,
    scoped_definitions,
)
from nitpicker_checks.constants import (
    common_prefix,
    is_enum_group,
    is_plain_class,
    string_constants,
)
from nitpicker_checks.docstrings import docstring_findings
from nitpicker_checks.fields import field_findings
from nitpicker_checks.project.entry_points import declared_entry_points, invalid_file_findings
from nitpicker_checks.project.enum_predicates import enum_predicate_findings
from nitpicker_checks.project.forwarding import forwarding_findings
from nitpicker_checks.project.index import ProjectIndex
from nitpicker_checks.project.unused_options import unused_option_findings
from nitpicker_checks.sleeps import fixed_sleep_findings
from nitpicker_checks.suppressions import stub_findings, suppression_findings

BOUNDARY_DIRECTORY = "adapters"
PYDANTIC_ROOTS = {"pydantic", "pydantic_settings"}
MIN_CLASS_CONSTANTS = 2
MIN_MODULE_CONSTANTS = 3
TYPE_CHECKING_NAMES = {"typing.TYPE_CHECKING", "typing_extensions.TYPE_CHECKING"}
OPTIONAL_IMPORT_ERRORS = {"ImportError", "ModuleNotFoundError"}
TOO_DEEP_RULE = "rules-skipped"
BLIND_ERRORS = {"Exception", "BaseException", "builtins.Exception", "builtins.BaseException"}


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


def is_boundary_path(path):
    return BOUNDARY_DIRECTORY in path.split("/")[:-1]


def is_frozen(decorator):
    return isinstance(decorator, ast.Call) and any(
        keyword.arg == "frozen"
        and isinstance(keyword.value, ast.Constant)
        and keyword.value.value is True
        for keyword in decorator.keywords
    )


class Collector(ast.NodeVisitor):
    def __init__(self, path, aliases, tests):
        self.path = path
        self.aliases = aliases
        self.scope = []
        self.findings = []
        self.tests = tests
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
            if decorator_name(decorator, self.aliases) == "dataclass" and not is_frozen(decorator):
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
                    groups.setdefault(name.split("_", 1)[0], []).append((statement, name, value))
        for prefix in sorted(groups):
            members = groups[prefix]
            constants = [(name, value) for _, name, value in members]
            if len(members) >= MIN_MODULE_CONSTANTS and is_enum_group(constants, prefix + "_"):
                self.add("enum-string-constants", prefix + "_*", members[0][0])


def parse(path):
    with tokenize.open(path) as handle:
        text = handle.read()
    return text, ast.parse(text)


def collected_findings(path, tree, aliases, tests):
    collector = Collector(path, aliases, tests)
    collector.visit(tree)
    collector.check_module_constants(tree)
    return collector.findings


def guarded(path, name, check):
    try:
        return check()
    except RecursionError:
        return [finding(TOO_DEEP_RULE, path, name, 1)]


def check_file(path, text, tree, tests):
    aliases = import_aliases(tree)
    scoped = scoped_definitions(tree)
    checks = {
        "file": lambda: collected_findings(path, tree, aliases, tests),
        "fixed-sleep": lambda: fixed_sleep_findings(path, tree, aliases) if tests else [],
        "docstring": lambda: docstring_findings(path, scoped),
        "field": lambda: [] if tests else field_findings(path, scoped, aliases),
    }
    found = suppression_findings(path, text)
    for name, check in checks.items():
        found.extend(guarded(path, name, check))
    return found


def read_options(arguments):
    if len(arguments) < 3:
        return {}
    with open(arguments[2], encoding="utf-8") as handle:
        return json.load(handle)


def file_findings(paths, tests):
    findings, trees = [], {}
    for path in paths:
        findings.extend(stub_findings(path))
        try:
            text, tree = parse(path)
        except RecursionError:
            findings.append(finding(TOO_DEEP_RULE, path, "all", 1))
            continue
        except (OSError, SyntaxError, UnicodeDecodeError, ValueError):
            continue
        findings.extend(check_file(path, text, tree, path in tests))
        trees[path] = tree
    return findings, trees


def project_findings(index, options):
    checks = {
        "forwarding-wrapper": lambda: forwarding_findings(index),
        "exhaustive-enum-predicate": lambda: enum_predicate_findings(index),
        "unused-option": lambda: unused_option_findings(index, options),
    }
    return [found for name, check in checks.items() for found in guarded(".", name, check)]


def main(arguments):
    list_file, out_file = arguments[:2]
    options = read_options(arguments)
    entries, problems = declared_entry_points()
    options["entryPoints"] = options.get("entryPoints", []) + entries
    with open(list_file, encoding="utf-8") as handle:
        paths = [line.strip() for line in handle if line.strip()]
    tests = set(options.get("tests", []))
    findings, trees = file_findings(paths, tests)
    index = ProjectIndex(trees, options.get("modules", {}), tests)
    findings.extend(project_findings(index, options))
    findings.extend(invalid_file_findings(options.get("invalidFiles", []) + problems))
    findings.sort(key=lambda item: (item["path"], item["line"], item["rule"], item["subject"]))
    with open(out_file, "w", encoding="utf-8") as handle:
        json.dump(findings, handle)


if __name__ == "__main__":
    main(sys.argv[1:])
