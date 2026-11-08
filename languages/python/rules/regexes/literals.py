import ast

from checks.common import dotted_name

RULE = "regex-pattern"
FLAG_POSITIONS = {
    "re.compile": 1,
    "re.match": 2,
    "re.search": 2,
    "re.fullmatch": 2,
    "re.findall": 2,
    "re.finditer": 2,
    "re.split": 3,
    "re.sub": 4,
    "re.subn": 4,
}
FLAG_LETTERS = {
    "re.I": "i",
    "re.IGNORECASE": "i",
    "re.M": "m",
    "re.MULTILINE": "m",
    "re.S": "s",
    "re.DOTALL": "s",
    "re.A": "",
    "re.ASCII": "",
    "re.U": "",
    "re.UNICODE": "",
}


def flag_names(node, aliases):
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        left = flag_names(node.left, aliases)
        right = flag_names(node.right, aliases)
        return None if left is None or right is None else left + right
    name = dotted_name(node, aliases)
    return [name] if name in FLAG_LETTERS else None


def flags_argument(call, position):
    keyword = next((k.value for k in call.keywords if k.arg == "flags"), None)
    if keyword is not None:
        return keyword
    return call.args[position] if len(call.args) > position else None


def flags_of(call, name, aliases):
    argument = flags_argument(call, FLAG_POSITIONS[name])
    if argument is None:
        return ""
    names = flag_names(argument, aliases)
    if names is None:
        return None
    return "".join(sorted({FLAG_LETTERS[flag] for flag in names}))


def literal_pattern(call):
    pattern = call.args[0] if call.args else None
    pattern = pattern or next((k.value for k in call.keywords if k.arg == "pattern"), None)
    if isinstance(pattern, ast.Constant) and isinstance(pattern.value, str):
        return pattern.value
    return None


def site(context, call):
    name = dotted_name(call.func, context.aliases) or ""
    if name not in FLAG_POSITIONS:
        return None
    pattern = literal_pattern(call)
    flags = flags_of(call, name, context.aliases)
    if pattern is None or flags is None:
        return None
    return {
        "rule": RULE,
        "path": context.path,
        "subject": pattern,
        "line": call.lineno,
        "data": {"pattern": pattern, "flags": flags},
    }


def check(context):
    if context.tests:
        return []
    calls = (node for node in ast.walk(context.tree) if isinstance(node, ast.Call))
    return [found for found in (site(context, call) for call in calls) if found is not None]
