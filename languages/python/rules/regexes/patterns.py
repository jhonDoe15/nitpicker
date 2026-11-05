import ast

from checks.common import dotted_name, finding

RULE = "regex-unescaped-value"
MODULES = ("re", "regex")
FUNCTIONS = {
    "compile",
    "match",
    "search",
    "fullmatch",
    "sub",
    "subn",
    "split",
    "findall",
    "finditer",
}
FUNCTION_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
NON_TEXT_TYPES = {"int", "float", "bool", "complex"}
RECEIVERS = {"self", "cls"}
NUMBER_CALLS = {"len", "int", "float", "round", "abs", "hash", "id", "ord"}
ESCAPES = {"re.escape", "regex.escape"}
ESCAPE_WORDS = ("re", "regex", "pattern")
MAX_DEPTH = 6


def is_regex_call(call, aliases):
    name = dotted_name(call.func, aliases) or ""
    module, _, function = name.rpartition(".")
    return module in MODULES and function in FUNCTIONS


def pattern_of(call):
    if call.args:
        return call.args[0]
    return next((k.value for k in call.keywords if k.arg == "pattern"), None)


def is_text(node):
    return isinstance(node, ast.Constant) and isinstance(node.value, str)


def concatenation(node):
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return concatenation(node.left) + concatenation(node.right)
    return [node]


def built_values(pattern):
    if isinstance(pattern, ast.JoinedStr):
        return [part.value for part in pattern.values if isinstance(part, ast.FormattedValue)]
    if isinstance(pattern, ast.BinOp) and isinstance(pattern.op, ast.Mod) and is_text(pattern.left):
        right = pattern.right
        return list(right.elts) if isinstance(right, ast.Tuple) else [right]
    if isinstance(pattern, ast.BinOp) and isinstance(pattern.op, ast.Add):
        parts = concatenation(pattern)
        return [part for part in parts if not is_text(part)] if any(map(is_text, parts)) else []
    func = pattern.func if isinstance(pattern, ast.Call) else None
    if isinstance(func, ast.Attribute) and func.attr == "format" and is_text(func.value):
        return list(pattern.args) + [keyword.value for keyword in pattern.keywords]
    return []


def callable_name(node, aliases):
    return dotted_name(node, aliases) or ""


def is_escape_name(node, aliases):
    if not isinstance(node, (ast.Name, ast.Attribute)):
        return False
    name = callable_name(node, aliases)
    last = name.rsplit(".", 1)[-1].lower()
    escape_word = "escape" in last and any(word in last for word in ESCAPE_WORDS[1:])
    return name in ESCAPES or (last != "unescape" and escape_word)


def is_number_call(node, aliases):
    return isinstance(node, ast.Call) and callable_name(node.func, aliases) in NUMBER_CALLS


def value_children(node):
    if isinstance(node, ast.IfExp):
        return [node.body, node.orelse]
    return list(ast.iter_child_nodes(node))


def loaded_names(node, aliases):
    pending, names = [node], []
    while pending:
        current = pending.pop()
        if is_escape_name(current, aliases):
            return []
        if is_number_call(current, aliases):
            continue
        if isinstance(current, ast.Attribute) and current.attr == "pattern":
            continue
        if isinstance(current, ast.Name) and isinstance(current.ctx, ast.Load):
            names.append(current.id)
        pending.extend(value_children(current))
    return names


def enclosing_function(node, context):
    parent = context.parents.get(id(node))
    while parent is not None and not isinstance(parent, FUNCTION_TYPES):
        parent = context.parents.get(id(parent))
    return parent


def parameters(function):
    arguments = function.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    every += [item for item in (arguments.vararg, arguments.kwarg) if item is not None]
    return {argument.arg: argument for argument in every}


def annotation_names(annotation):
    if isinstance(annotation, ast.Constant) and isinstance(annotation.value, str):
        try:
            annotation = ast.parse(annotation.value, mode="eval").body
        except SyntaxError:
            return set()
    if isinstance(annotation, ast.BinOp) and isinstance(annotation.op, ast.BitOr):
        return annotation_names(annotation.left) | annotation_names(annotation.right)
    if isinstance(annotation, ast.Constant) and annotation.value is None:
        return {"None"}
    return {annotation.id} if isinstance(annotation, ast.Name) else {"?"}


def is_non_text(argument):
    names = annotation_names(argument.annotation) - {"None"}
    return bool(names) and names <= NON_TEXT_TYPES


def bound_values(function, name):
    values = []
    for node in ast.walk(function):
        if isinstance(node, ast.Assign):
            if any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
                values.append(node.value)
        elif isinstance(node, (ast.AnnAssign, ast.NamedExpr)) and node.value is not None:
            if isinstance(node.target, ast.Name) and node.target.id == name:
                values.append(node.value)
        elif isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
            if isinstance(node.target, ast.Name) and node.target.id == name:
                values.append(node.iter)
    return values


def depends_on_input(node, function, aliases, depth=0):
    if depth > MAX_DEPTH:
        return False
    own = parameters(function)
    for name in loaded_names(node, aliases):
        argument = own.get(name)
        if name in RECEIVERS:
            continue
        if argument is not None:
            if not is_non_text(argument):
                return True
            continue
        values = bound_values(function, name)
        if any(depends_on_input(value, function, aliases, depth + 1) for value in values):
            return True
    return False


def runtime_value(call, context):
    pattern = pattern_of(call)
    function = enclosing_function(call, context)
    if pattern is None or function is None:
        return None
    return next(
        (
            value
            for value in built_values(pattern)
            if not is_text(value) and depends_on_input(value, function, context.aliases)
        ),
        None,
    )


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Call) and is_regex_call(node, context.aliases):
            value = runtime_value(node, context)
            if value is not None:
                found.append(finding(context.path, RULE, ast.unparse(value), node))
    return found
