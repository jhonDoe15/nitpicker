import ast

from checks.common import dotted_name, finding, is_log_call, type_text

OPTIONAL_IMPORT_ERRORS = {"ImportError", "ModuleNotFoundError"}
BLIND_ERRORS = {
    "Exception",
    "BaseException",
    "builtins.Exception",
    "builtins.BaseException",
}
REPORT_CALLS = {
    "warnings.warn",
    "traceback.print_exc",
    "traceback.print_exception",
    "print",
    "pprint.pprint",
}


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
    caught = (
        handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    )
    names = {node.id for node in caught if isinstance(node, ast.Name)}
    return len(names) == len(caught) and names <= OPTIONAL_IMPORT_ERRORS


def is_report(call, aliases):
    return is_log_call(call, aliases) or dotted_name(call.func, aliases) in REPORT_CALLS


def is_inert(statement, optional_import, aliases):
    if isinstance(statement, ast.Return):
        return statement.value is None or is_constant(statement.value)
    if isinstance(statement, ast.Expr):
        value = statement.value
        return isinstance(value, ast.Constant) or (
            isinstance(value, ast.Call) and is_report(value, aliases)
        )
    if isinstance(statement, (ast.Assign, ast.AnnAssign)):
        return (
            not optional_import
            and statement.value is not None
            and is_constant(statement.value)
        )
    return isinstance(statement, (ast.Pass, ast.Continue))


class Errors(ast.NodeVisitor):
    def __init__(self, path, aliases):
        self.path = path
        self.aliases = aliases
        self.findings = []

    def visit_ExceptHandler(self, node):
        optional_import = node.type is not None and is_optional_import(node)
        if all(
            is_inert(statement, optional_import, self.aliases)
            for statement in node.body
        ):
            caught = type_text(node.type) if node.type else ""
            subject = f"except {caught}".strip()
            self.findings.append(
                finding(self.path, "swallowed-exception", subject, node)
            )
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
            self.findings.append(
                finding(self.path, "blind-suppress", f"{name}({arguments})", node)
            )
        self.generic_visit(node)


def check(context):
    visitor = Errors(context.path, context.aliases)
    visitor.visit(context.tree)
    return visitor.findings
