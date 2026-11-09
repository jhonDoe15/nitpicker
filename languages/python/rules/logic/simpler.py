import ast

from checks.common import finding

RULE = "simpler-boolean-logic"
SWAPPED = "swap "
ELIDED = ast.Expr(ast.Constant(Ellipsis))
FLIPPED = {ast.And: ast.Or, ast.Or: ast.And}


def is_not(node):
    return isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not)


def is_elif(node, lines):
    if len(node.orelse) != 1 or not isinstance(node.orelse[0], ast.If):
        return False
    inner = node.orelse[0]
    return lines[inner.lineno - 1][inner.col_offset :].startswith("elif")


def swapped_if(node, lines):
    if not is_not(node.test) or not node.orelse or is_elif(node, lines):
        return None
    form = ast.If(test=node.test.operand, body=[ELIDED], orelse=[ELIDED])
    return SWAPPED + " ".join(ast.unparse(form).split()).replace("...", "…")


def swapped_ternary(node):
    if not is_not(node.test) or isinstance(node.orelse, ast.IfExp):
        return None
    if ast.dump(node.orelse) == ast.dump(node.test.operand):
        return None
    form = ast.IfExp(test=node.test.operand, body=node.orelse, orelse=node.body)
    return SWAPPED + ast.unparse(form)


def operands_of(node, operator):
    if isinstance(node, ast.BoolOp) and isinstance(node.op, operator):
        return node.values
    return [node]


def factored(node):
    if not all(is_not(value) for value in node.values):
        return None
    operator = FLIPPED[type(node.op)]
    values = [inner for value in node.values for inner in operands_of(value.operand, operator)]
    return ast.unparse(ast.UnaryOp(op=ast.Not(), operand=ast.BoolOp(op=operator(), values=values)))


def simpler_form(node, lines):
    if isinstance(node, ast.If):
        return swapped_if(node, lines)
    if isinstance(node, ast.IfExp):
        return swapped_ternary(node)
    return factored(node) if isinstance(node, ast.BoolOp) else None


def check(context):
    lines = context.text.splitlines()
    found = []
    for node in ast.walk(context.tree):
        form = simpler_form(node, lines)
        if form is not None:
            found.append(finding(context.path, RULE, form, node))
    return found
