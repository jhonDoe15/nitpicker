import ast
import re

from checks.common import finding

RULE = "precondition-message-names-other-value"
SUBJECT = re.compile(
    r"^[`'\"]?([A-Za-z_][\w]*)[`'\"]?\s+(?:must|should|is|are|was|cannot|can't|can not|may not|has|have|"
    r"required|needs|not)\b",
    re.IGNORECASE,
)
WORD_BREAK = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[_\-\s]+")
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
RECEIVERS = {"self", "cls"}
HOOK_NAME = re.compile(r"^use[A-Z]")


def head_word(name):
    parts = [part for part in WORD_BREAK.split(name) if part]
    return re.sub(r"s$", "", parts[-1].lower()) if parts else ""


def normalized(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())


def operand_names(node):
    if isinstance(node, ast.Name):
        return [node.id]
    if isinstance(node, ast.Attribute):
        return operand_names(node.value) + [node.attr]
    return []


def is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


def checked_operand(test):
    if isinstance(test, ast.Compare) and len(test.ops) == 1 and is_none(test.comparators[0]):
        return test.left if isinstance(test.ops[0], (ast.Is, ast.Eq)) else None
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        return test.operand
    return None


def asserted_operand(test):
    if isinstance(test, ast.Compare) and len(test.ops) == 1 and is_none(test.comparators[0]):
        return test.left if isinstance(test.ops[0], (ast.IsNot, ast.NotEq)) else None
    return test if operand_names(test) else None


def message_text(node):
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


def raised_message(body):
    if len(body) != 1 or not isinstance(body[0], ast.Raise) or not isinstance(body[0].exc, ast.Call):
        return None
    arguments = body[0].exc.args
    return message_text(arguments[0]) if arguments else None


def enclosing_function(node, parents):
    current = parents.get(id(node))
    while current is not None and not isinstance(current, FUNCTIONS):
        current = parents.get(id(current))
    return current


def names_in_scope(function):
    arguments = function.args
    names = {a.arg for a in arguments.posonlyargs + arguments.args + arguments.kwonlyargs} - RECEIVERS
    for node in ast.walk(function):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
        elif isinstance(node, ast.Attribute) and operand_names(node.value) == ["self"]:
            names.add(node.attr)
    return names


def named_in_scope(function, message):
    match = SUBJECT.match(message.strip())
    if match is None:
        return None
    word = normalized(match.group(1))
    return next((name for name in sorted(names_in_scope(function)) if normalized(name) == word), None)


def derived_from(function, checked, named):
    for node in ast.walk(function):
        targets = node.targets if isinstance(node, ast.Assign) else []
        if any(isinstance(target, ast.Name) and target.id == checked for target in targets):
            if any(isinstance(inner, ast.Name) and inner.id == named for inner in ast.walk(node.value)):
                return True
    return False


def mismatch(node, operand, message, parents):
    names = [name for name in operand_names(operand) if name not in RECEIVERS] if operand else []
    function = enclosing_function(node, parents)
    named = named_in_scope(function, message) if names and message and function else None
    if named is None:
        return None
    if normalized(function.name) == normalized(named) or HOOK_NAME.match(named):
        return None
    if any(derived_from(function, name, named) for name in names):
        return None
    describing = any(head_word(name) == head_word(named) for name in names)
    mentioned = any(re.search(rf"\b{re.escape(name)}\b", message, re.IGNORECASE) for name in names)
    if describing or mentioned or normalized(named) in {normalized(name) for name in names}:
        return None
    return ".".join(names), named


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.If) and not node.orelse:
            args = (checked_operand(node.test), raised_message(node.body))
        elif isinstance(node, ast.Assert) and node.msg is not None:
            args = (asserted_operand(node.test), message_text(node.msg))
        else:
            continue
        result = mismatch(node, args[0], args[1], context.parents)
        if result is not None:
            found.append(finding(context.path, RULE, f"{result[0]}|{result[1]}", node))
    return found
