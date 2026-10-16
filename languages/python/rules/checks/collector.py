import ast

import assertion_rules
import catch_logging
from rule_helpers import (
    common_prefix,
    decorator_name,
    dotted_name,
    import_aliases,
    is_boundary_path,
    is_enum_group,
    is_frozen,
    is_inert,
    is_optional_import,
    is_plain_class,
    is_test_path,
    log_call_text,
    string_constants,
    type_text,
)

MIN_CLASS_CONSTANTS = 2
MIN_MODULE_CONSTANTS = 3
TYPE_CHECKING_NAMES = {"typing.TYPE_CHECKING", "typing_extensions.TYPE_CHECKING"}
BLIND_ERRORS = {
    "Exception",
    "BaseException",
    "builtins.Exception",
    "builtins.BaseException",
}


class Collector(ast.NodeVisitor):
    def __init__(self, path, tree, settings):
        self.path = path
        self.aliases = import_aliases(tree)
        self.boundary_roots = set(settings["boundary_roots"])
        self.assertion_helpers = settings["assertion_helpers"]
        self.logged = set()
        self.catch_logging = catch_logging.CatchLogging(tree, self.aliases, dotted_name)
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
        for call in catch_logging.uncaught_calls(node, self.catch_logging):
            if id(call) not in self.logged:
                self.logged.add(id(call))
                self.add("catch-log-without-exception", log_call_text(call.func), call)
        self.generic_visit(node)

    def visit_Call(self, node):
        name = dotted_name(node.func, self.aliases)
        if name == "contextlib.suppress" and (
            not node.args
            or any(
                dotted_name(argument, self.aliases) in BLIND_ERRORS
                for argument in node.args
            )
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
        if outside and module.split(".")[0] in self.boundary_roots:
            self.add("pydantic-boundary", module, node)

    def check_tests(self, tree):
        if not assertion_rules.is_test_file(self.path):
            return
        for subject, function in assertion_rules.unasserted_tests(
            tree, self.aliases, self.assertion_helpers
        ):
            self.add("test-without-assertion", subject, function)

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
