import ast

from checks.common import dotted_name, finding, type_text
from checks.handling import is_handled

OPTIONAL_IMPORT_ERRORS = {"ImportError", "ModuleNotFoundError"}
BLIND_ERRORS = {
    "Exception",
    "BaseException",
    "builtins.Exception",
    "builtins.BaseException",
}


def is_optional_import(handler):
    caught = (
        handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    )
    names = {node.id for node in caught if isinstance(node, ast.Name)}
    return len(names) == len(caught) and names <= OPTIONAL_IMPORT_ERRORS


def module_tuples(tree):
    found = {}
    for statement in tree.body:
        if (
            isinstance(statement, ast.Assign)
            and len(statement.targets) == 1
            and isinstance(statement.targets[0], ast.Name)
            and isinstance(statement.value, (ast.Tuple, ast.List))
        ):
            found[statement.targets[0].id] = statement.value.elts
    return found


class Errors(ast.NodeVisitor):
    def __init__(self, context):
        self.context = context
        self.scopes = [context.tree]
        self.tuples = module_tuples(context.tree)
        self.findings = []

    def visit_scope(self, node):
        self.scopes.append(node)
        self.generic_visit(node)
        self.scopes.pop()

    visit_FunctionDef = visit_scope
    visit_AsyncFunctionDef = visit_scope

    def visit_ExceptHandler(self, node):
        optional_import = node.type is not None and is_optional_import(node)
        if not is_handled(node, self.context, self.scopes[-1], optional_import):
            caught = type_text(node.type) if node.type else ""
            subject = f"except {caught}".strip()
            self.findings.append(
                finding(self.context.path, "swallowed-exception", subject, node)
            )
        self.generic_visit(node)

    def caught_names(self, node):
        for argument in node.args:
            target = argument.value if isinstance(argument, ast.Starred) else argument
            members = (
                self.tuples.get(target.id) if isinstance(target, ast.Name) else None
            )
            if isinstance(argument, ast.Starred) and members is not None:
                yield from members
            else:
                yield argument

    def visit_Call(self, node):
        aliases = self.context.aliases
        name = dotted_name(node.func, aliases)
        if name == "contextlib.suppress" and (
            not node.args
            or any(
                dotted_name(caught, aliases) in BLIND_ERRORS
                for caught in self.caught_names(node)
            )
        ):
            arguments = ", ".join(type_text(argument) for argument in node.args)
            self.findings.append(
                finding(
                    self.context.path, "blind-suppress", f"{name}({arguments})", node
                )
            )
        self.generic_visit(node)


def check(context):
    visitor = Errors(context)
    visitor.visit(context.tree)
    return visitor.findings
