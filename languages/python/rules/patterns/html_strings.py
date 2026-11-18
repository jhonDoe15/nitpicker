import ast
import re

from checks.common import finding, shown

GUARDED = True
RULE = "unescaped-html-value"
TAGS = (
    "a|b|body|br|button|code|div|em|form|h[1-6]|head|hr|html|i|iframe|img|input|label|li|link|meta|ol|"
    "option|p|pre|script|section|select|small|span|strong|style|svg|table|tbody|td|textarea|th|thead|"
    "title|tr|u|ul"
)
MARKUP = re.compile(rf"(?<![\w)\]])</?(?:{TAGS})(?=[\s>/]|$)")
SAFE_CALL = re.compile(
    r"escape|encode|sanitize|html|quote|urlencode|(?:^|[\s_])enc(?:$|[\s_])", re.IGNORECASE
)
SAFE_NAME = re.compile(
    r"html|markup|escaped|encoded|sanitized|safe|class|charset|encoding|nonce|color|icon", re.IGNORECASE
)
DIAGNOSTIC_CALLS = {"warn", "error", "info", "debug", "warning", "exception", "critical", "log"}
NUMERIC_TYPES = {"int", "float", "bool"}
NUMERIC_VERBS = "diouxXeEfFgGc"
VERB = re.compile(r"%(?:\([^)]*\))?[-+# 0]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[hlL]?([a-zA-Z%])")
NUMERIC_CALLS = {"int", "float", "len", "round", "abs", "sum", "min", "max", "bool"}
NUMERIC_SPEC = re.compile(r"[\d.,_]*[dfeEgGxXobn%]$")


def text_of(parts):
    return [
        part.value
        for part in parts
        if isinstance(part, ast.Constant) and isinstance(part.value, str)
    ]


def call_name(node):
    func = node.func
    if isinstance(func, ast.Attribute):
        owner = func.value.id if isinstance(func.value, ast.Name) else ""
        return func.attr + " " + owner
    return getattr(func, "id", "")


def is_markup_fragment(node):
    if isinstance(node, ast.JoinedStr):
        return any(MARKUP.search(text) for text in text_of(node.values))
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Mod)):
        return any(MARKUP.search(text) for text in text_of(ast.walk(node)))
    return False


def is_safe(node, scope, depth=0):
    if depth > 5:
        return False
    if isinstance(node, (ast.Constant, ast.UnaryOp, ast.Compare)):
        return True
    if isinstance(node, ast.BoolOp):
        return all(is_safe(value, scope, depth + 1) for value in node.values)
    if isinstance(node, ast.Name):
        return (
            bool(SAFE_NAME.search(node.id))
            or node.id in numeric_names(scope)
            or assigned_safe(node.id, scope, depth)
        )
    if isinstance(node, ast.Attribute):
        return bool(SAFE_NAME.search(node.attr))
    if isinstance(node, ast.Call):
        name = call_name(node)
        mapped = isinstance(node.func, ast.Attribute) and node.func.attr == "join"
        return bool(SAFE_CALL.search(name)) or name in NUMERIC_CALLS or mapped
    if isinstance(node, ast.IfExp):
        return is_safe(node.body, scope, depth + 1) and is_safe(node.orelse, scope, depth + 1)
    if isinstance(node, ast.JoinedStr):
        return is_markup_fragment(node) or all(is_formatted_safe(part, scope, depth) for part in node.values)
    if isinstance(node, ast.BinOp):
        return not isinstance(node.op, (ast.Add, ast.Mod)) or is_markup_fragment(node)
    return False


def is_formatted_safe(part, scope, depth):
    if isinstance(part, ast.Constant):
        return True
    if not isinstance(part, ast.FormattedValue):
        return False
    spec = part.format_spec
    if isinstance(spec, ast.JoinedStr) and spec.values:
        text = "".join(text_of(spec.values))
        if NUMERIC_SPEC.match(text):
            return True
    return is_safe(part.value, scope, depth + 1)


def fstring_values(node, scope):
    return [
        part.value
        for part in node.values
        if isinstance(part, ast.FormattedValue) and not is_formatted_safe(part, scope, 0)
    ]


def percent_values(node, scope):
    right = node.right
    values = right.elts if isinstance(right, ast.Tuple) else [right]
    verbs = [verb for verb in VERB.findall(node.left.value) if verb != "%"]
    return [
        value
        for index, value in enumerate(values)
        if not (index < len(verbs) and verbs[index] in NUMERIC_VERBS) and not is_safe(value, scope)
    ]


def operands(node):
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return operands(node.left) + operands(node.right)
    return [node]


def concat_values(node, scope):
    parts = operands(node)
    texts = [part.value for part in parts if isinstance(part, ast.Constant) and isinstance(part.value, str)]
    if len(parts) < 2 or not any(MARKUP.search(text) for text in texts):
        return []
    rest = [part for part in parts if not isinstance(part, ast.Constant)]
    return [part for part in rest if not is_safe(part, scope)]


def numeric_annotation(node):
    annotation = getattr(node, "annotation", None)
    return isinstance(annotation, ast.Name) and annotation.id in NUMERIC_TYPES


def declared_numbers(node):
    if isinstance(node, ast.arg) and numeric_annotation(node):
        return {node.arg}
    if isinstance(node, ast.AnnAssign) and numeric_annotation(node) and isinstance(node.target, ast.Name):
        return {node.target.id}
    if isinstance(node, (ast.For, ast.comprehension)) and is_counter(node.iter):
        return {name.id for name in ast.walk(node.target) if isinstance(name, ast.Name)}
    return set()


def numeric_names(scope):
    names = set()
    for node in ast.walk(scope):
        names |= declared_numbers(node)
    return names


def is_counter(iterator):
    return isinstance(iterator, ast.Call) and getattr(iterator.func, "id", "") == "range"


def format_values(node, scope):
    values = list(node.args) + [keyword.value for keyword in node.keywords]
    return [value for value in values if not is_safe(value, scope)]


def unsafe_values(node, scope):
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return concat_values(node, scope)
    if isinstance(node, ast.JoinedStr) and is_markup_fragment(node):
        return fstring_values(node, scope)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mod):
        constant = isinstance(node.left, ast.Constant) and isinstance(node.left.value, str)
        return percent_values(node, scope) if constant and MARKUP.search(node.left.value) else []
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "format":
        owner = node.func.value
        marked = isinstance(owner, ast.Constant) and isinstance(owner.value, str) and MARKUP.search(owner.value)
        return format_values(node, scope) if marked else []
    return []


def enclosing_scope(node, parents):
    current = parents.get(id(node))
    while current is not None and not isinstance(
        current, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Module)
    ):
        current = parents.get(id(current))
    return current


def assigned_safe(name, scope, depth):
    values = [
        node.value
        for node in ast.walk(scope)
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and node.targets[0].id == name
    ]
    return len(values) > 0 and all(is_safe(value, scope, depth + 1) for value in values)


def is_nested_concat(node, parents):
    parent = parents.get(id(node))
    return isinstance(parent, ast.BinOp) and isinstance(parent.op, ast.Add) and isinstance(node, ast.BinOp)


def is_diagnostic(node, parents):
    current = parents.get(id(node))
    while current is not None and not isinstance(current, ast.stmt):
        if isinstance(current, ast.Call) and is_diagnostic_call(current):
            return True
        current = parents.get(id(current))
    return isinstance(current, ast.Raise)


def is_diagnostic_call(call):
    name = call.func.attr if isinstance(call.func, ast.Attribute) else getattr(call.func, "id", "")
    return name.endswith(("Error", "Exception", "Warning")) or name in DIAGNOSTIC_CALLS


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if is_nested_concat(node, context.parents) or is_diagnostic(node, context.parents):
            continue
        values = unsafe_values(node, enclosing_scope(node, context.parents))
        if values:
            found.append(finding(context.path, RULE, shown(ast.unparse(values[0])), node))
    return found
