import ast

from checks.common import finding, shown

GUARDED = True
RULE = "expanding-replacement"
SUB_FUNCTIONS = {"sub", "subn"}
TEXT_METHODS = {"format", "join", "strip", "lstrip", "rstrip", "lower", "upper", "title", "casefold"}


def is_re_compile(node):
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
        return False
    owner = node.func.value
    return node.func.attr == "compile" and isinstance(owner, ast.Name) and owner.id == "re"


def compiled_names(tree):
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and is_re_compile(node.value):
            names.update(ast.unparse(target) for target in node.targets)
        elif isinstance(node, ast.AnnAssign) and node.value is not None and is_re_compile(node.value):
            names.add(ast.unparse(node.target))
    return names


def sub_replacement(call, compiled):
    func = call.func
    if not isinstance(func, ast.Attribute) or func.attr not in SUB_FUNCTIONS:
        return None
    if isinstance(func.value, ast.Name) and func.value.id == "re" and len(call.args) >= 3:
        return call.args[1]
    if ast.unparse(func.value) in compiled and len(call.args) >= 2:
        return call.args[0]
    return None


def constant_parts(node):
    return [part for part in ast.walk(node) if isinstance(part, ast.Constant) and isinstance(part.value, str)]


def escapes_backslash(node):
    if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
        return False
    if node.func.attr != "replace" or not node.args:
        return False
    first = node.args[0]
    return isinstance(first, ast.Constant) and isinstance(first.value, str) and "\\" in first.value


def is_string_expression(node):
    if isinstance(node, ast.JoinedStr):
        return any(isinstance(part, ast.FormattedValue) for part in node.values)
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Mod)):
        return any(isinstance(part, ast.Constant) and isinstance(part.value, str) for part in ast.walk(node))
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        return node.func.id == "str" and len(node.args) == 1
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        owner = node.func.value
        text_owner = isinstance(owner, ast.Constant) and isinstance(owner.value, str)
        return node.func.attr in TEXT_METHODS and (text_owner or node.func.attr != "format")
    return False


def has_backslash_or_group(node):
    return any("\\" in part.value for part in constant_parts(node))


def string_parameter(name, scope):
    arguments = scope.args.args + scope.args.kwonlyargs + scope.args.posonlyargs
    for argument in arguments:
        if argument.arg == name and argument.annotation is not None:
            return ast.unparse(argument.annotation).replace(" ", "") in {"str", "str|None", "Optional[str]"}
    return False


def enclosing_function(node, parents):
    current = parents.get(id(node))
    while current is not None and not isinstance(current, (ast.FunctionDef, ast.AsyncFunctionDef)):
        current = parents.get(id(current))
    return current


def assigned_string(name, scope):
    values = [
        node.value
        for node in ast.walk(scope)
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and node.targets[0].id == name
    ]
    return len(values) == 1 and is_string_expression(values[0]) and not escapes_backslash(values[0])


def is_runtime_string(node, parents):
    if isinstance(node, ast.Constant) or isinstance(node, ast.Lambda) or escapes_backslash(node):
        return False
    if has_backslash_or_group(node) and not isinstance(node, ast.Name):
        return False
    if isinstance(node, ast.Name):
        scope = enclosing_function(node, parents)
        return scope is not None and (string_parameter(node.id, scope) or assigned_string(node.id, scope))
    return is_string_expression(node)


def check(context):
    if context.tests:
        return []
    compiled = compiled_names(context.tree)
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        replacement = sub_replacement(node, compiled)
        if replacement is not None and is_runtime_string(replacement, context.parents):
            found.append(finding(context.path, RULE, shown(ast.unparse(replacement)), node))
    return found
