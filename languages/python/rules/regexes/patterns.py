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


def is_escape(node):
    if not isinstance(node, ast.Call):
        return False
    func = node.func
    name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
    return "escape" in name.lower()


def loaded_names(node):
    pending, names = [node], []
    while pending:
        current = pending.pop()
        if is_escape(current):
            continue
        if isinstance(current, ast.Attribute) and current.attr == "pattern":
            continue
        if isinstance(current, ast.Name) and isinstance(current.ctx, ast.Load):
            names.append(current.id)
        pending.extend(ast.iter_child_nodes(current))
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


def is_non_text(argument):
    annotation = argument.annotation
    return isinstance(annotation, ast.Name) and annotation.id in NON_TEXT_TYPES


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


def depends_on_input(node, function, depth=0):
    if depth > MAX_DEPTH:
        return False
    own = parameters(function)
    for name in loaded_names(node):
        argument = own.get(name)
        if argument is not None:
            if not is_non_text(argument):
                return True
            continue
        values = bound_values(function, name)
        if any(depends_on_input(value, function, depth + 1) for value in values):
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
            if not is_text(value) and depends_on_input(value, function)
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
