import ast

from checks.common import dotted_name, last_name, words_of

ENVIRONMENT_READERS = {
    "os.getenv",
    "os.environ.get",
    "os.environ.setdefault",
    "os.environ.pop",
    "decouple.config",
}
SETTINGS_RECEIVERS = {"env", "environ", "environment", "secrets", "settings"}
SETTINGS_METHODS = {"get", "getenv", "setdefault", "pop", "str"}
SETTINGS_CALLS = {"config", "env"}
ENUM_BASES = {"Enum", "StrEnum", "IntEnum", "Flag", "IntFlag"}


def string_key(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def target_name(target):
    if isinstance(target, ast.Name):
        return target.id
    if isinstance(target, ast.Attribute):
        return target.attr
    if isinstance(target, ast.Subscript):
        return string_key(target.slice)
    return None


def target_pairs(target, value):
    unpacked = isinstance(target, (ast.Tuple, ast.List)) and isinstance(
        value, (ast.Tuple, ast.List)
    )
    if unpacked and len(target.elts) == len(value.elts):
        return list(zip(target.elts, value.elts))
    return [(target, value)]


def reads_settings(call, aliases):
    function = call.func
    if dotted_name(function, aliases) in ENVIRONMENT_READERS:
        return True
    if isinstance(function, ast.Name):
        return function.id in SETTINGS_CALLS
    if not isinstance(function, ast.Attribute) or function.attr not in SETTINGS_METHODS:
        return False
    receiver = words_of(last_name(function.value) or "")
    return bool(receiver) and receiver[-1] in SETTINGS_RECEIVERS


def keyed_default(call, aliases):
    key = string_key(call.args[0]) if call.args else None
    option = isinstance(call.func, ast.Attribute) and call.func.attr == "add_argument"
    if key is None or not (option or reads_settings(call, aliases)):
        return None
    defaults = [k.value for k in call.keywords if k.arg == "default"]
    if defaults:
        return key.lstrip("-"), defaults[0]
    positional = len(call.args) == 2 and not option
    return (key, call.args[1]) if positional else None


def set_attribute(call):
    named = isinstance(call.func, ast.Name) and call.func.id == "setattr"
    key = string_key(call.args[1]) if named and len(call.args) == 3 else None
    return (key, call.args[2]) if key is not None else None


def call_pairs(call, aliases):
    pairs = [keyed_default(call, aliases), set_attribute(call)]
    return [(key, value, value) for key, value in (p for p in pairs if p)]


def returned_value(function):
    body = function.body
    documented = body and isinstance(body[0], ast.Expr) and string_key(body[0].value)
    first = body[1] if documented and len(body) > 1 else body[0]
    names = [a.arg for a in function.args.posonlyargs + function.args.args]
    bare = (
        all(name in {"self", "cls"} for name in names) and not function.args.kwonlyargs
    )
    if bare and isinstance(first, ast.Return) and first.value is not None:
        return [(function.name, first.value, first.value)]
    return []


def defaults(function):
    arguments = function.args
    positional = arguments.posonlyargs + arguments.args
    pairs = list(
        zip(positional[len(positional) - len(arguments.defaults) :], arguments.defaults)
    )
    pairs += [
        (a, d)
        for a, d in zip(arguments.kwonlyargs, arguments.kw_defaults)
        if d is not None
    ]
    return [(argument.arg, default, default) for argument, default in pairs]


def is_enum_member(node, parents):
    owner = parents.get(id(node))
    if not isinstance(owner, ast.ClassDef):
        return False
    return any(last_name(base) in ENUM_BASES for base in owner.bases)


def assigned(node):
    if isinstance(node, ast.Assign):
        pairs = [p for target in node.targets for p in target_pairs(target, node.value)]
        return [(target_name(target), value, node) for target, value in pairs]
    if isinstance(node, (ast.AnnAssign, ast.NamedExpr)) and node.value is not None:
        return [(target_name(node.target), node.value, node)]
    return []


def named_values(node, aliases):
    if isinstance(node, ast.keyword) and node.arg:
        return [(node.arg, node.value, node.value)]
    if isinstance(node, ast.Call):
        return call_pairs(node, aliases)
    if isinstance(node, ast.Dict):
        return [
            (key.value, value, value)
            for key, value in zip(node.keys, node.values)
            if string_key(key) is not None
        ]
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return defaults(node) + returned_value(node)
    return []


def assignments(context):
    for node in ast.walk(context.tree):
        if not is_enum_member(node, context.parents):
            yield from assigned(node)
        yield from named_values(node, context.aliases)
