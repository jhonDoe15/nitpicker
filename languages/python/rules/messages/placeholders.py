import ast
import builtins
import re

PRINTF = re.compile(r"%(?:\([^)]*\))?[-#0+]*\d*(?:\.\d+)?[sdrifxXeEgGc]")
FIELD = re.compile(r"\{([^{}]*)\}")
CONVERSION_OR_SPEC = re.compile(r"[!:]")
BUILTINS = set(dir(builtins))


def unescaped(text):
    return text.replace("{{", "").replace("}}", "")


def brace_fields(text):
    return FIELD.findall(unescaped(text))


def printf_fields(text):
    return PRINTF.findall(text.replace("%%", ""))


def expression_of(field):
    source = CONVERSION_OR_SPEC.split(field, 1)[0].strip()
    if not source:
        return None
    try:
        return ast.parse(source, mode="eval").body
    except SyntaxError:
        return None


def names_in(expression):
    return {node.id for node in ast.walk(expression) if isinstance(node, ast.Name)}


def literal_text(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None
