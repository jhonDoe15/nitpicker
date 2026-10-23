import ast
import os
import re

from checks.common import dotted_name, finding, is_boundary_path
from syntax.walk import IterativeVisitor

DEFAULT_BOUNDARY_ROOTS = ["pydantic", "pydantic_settings"]
MIN_CLASS_CONSTANTS = 2
MIN_MODULE_CONSTANTS = 3
TYPE_CHECKING_NAMES = {"typing.TYPE_CHECKING", "typing_extensions.TYPE_CHECKING"}
CONSTANT_NAME = re.compile(r"[A-Z][A-Z0-9_]*")


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


class Declarations(IterativeVisitor):
    def __init__(self, context):
        super().__init__()
        self.path = context.path
        self.aliases = context.aliases
        self.scope = []
        self.findings = []
        self.tests = context.tests
        self.boundary = is_boundary_path(context.path)
        self.boundary_roots = set(
            context.options.get("boundaryRoots", DEFAULT_BOUNDARY_ROOTS)
        )

    def add(self, rule, subject, node):
        self.findings.append(finding(self.path, rule, subject, node))

    def visit_scope(self, node):
        self.scope.append(node.name)
        self.check_no_type_check(node)
        self.on_exit(self.scope.pop)
        self.generic_visit(node)

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

    visit_FunctionDef = visit_scope
    visit_AsyncFunctionDef = visit_scope

    def visit_ClassDef(self, node):
        self.scope.append(node.name)
        subject = ".".join(self.scope)
        self.check_no_type_check(node)
        self.check_dataclass(node, subject)
        self.check_class_constants(node, subject)
        self.on_exit(self.scope.pop)
        self.generic_visit(node)

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


def check(context):
    visitor = Declarations(context)
    visitor.visit(context.tree)
    visitor.check_module_constants(context.tree)
    return visitor.findings
