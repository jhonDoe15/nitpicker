import ast
import copy

from checks.common import finding

RULE = "copy-pasted-tests"
MIN_COPIES = 3
NUMBER_SIGNS = (ast.USub, ast.UAdd)
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
PLACEHOLDER = "<literal>"


class Literals(ast.NodeTransformer):
    def visit_Constant(self, node):
        return ast.copy_location(ast.Constant(value=PLACEHOLDER), node)

    def visit_UnaryOp(self, node):
        if isinstance(node.op, NUMBER_SIGNS) and isinstance(node.operand, ast.Constant):
            return ast.copy_location(ast.Constant(value=PLACEHOLDER), node)
        return self.generic_visit(node)


def is_test_name(name):
    return name.startswith("test")


def is_parameterized(node):
    return any(
        "parametrize" in ast.dump(decorator) or "data_provider" in ast.dump(decorator)
        for decorator in node.decorator_list
    )


def without_docstring(body):
    first = body[0] if body else None
    is_text = (
        isinstance(first, ast.Expr)
        and isinstance(first.value, ast.Constant)
        and isinstance(first.value.value, str)
    )
    return body[1:] if is_text else body


def shape_of(node):
    marks = [ast.dump(Literals().visit(copy.deepcopy(item))) for item in node.decorator_list]
    parts = marks + [ast.dump(node.args)] + [
        ast.dump(Literals().visit(copy.deepcopy(statement)))
        for statement in without_docstring(node.body)
    ]
    return "\n".join(parts)


def copies_in(body):
    groups = {}
    for node in body:
        if isinstance(node, FUNCTIONS) and is_test_name(node.name) and not is_parameterized(node):
            groups.setdefault(shape_of(node), []).append(node)
    return [group for group in groups.values() if len(group) >= MIN_COPIES]


def owners(tree):
    return [node for node in ast.walk(tree) if isinstance(node, (ast.Module, ast.ClassDef))]


def check(context):
    if not context.tests:
        return []
    findings = []
    for owner in owners(context.tree):
        prefix = f"{owner.name}." if isinstance(owner, ast.ClassDef) else ""
        for group in copies_in(owner.body):
            for node in group[MIN_COPIES - 1 :]:
                subject = f"{prefix}{node.name}:{len(group) - 1}"
                findings.append(finding(context.path, RULE, subject, node))
    return findings
