import ast

from checks.common import dotted_name, finding
from security.values import argument, can_be_true, definition, keyword, where_of

RULE = "unsafe-deserialization"
ALWAYS_UNSAFE = {
    "yaml.unsafe_load",
    "yaml.unsafe_load_all",
    "yaml.full_load",
    "yaml.full_load_all",
    "ruamel.yaml.unsafe_load",
    "ruamel.yaml.unsafe_load_all",
}
SAFE_LOADERS = {"SafeLoader", "CSafeLoader", "BaseLoader", "CBaseLoader"}
UNSAFE_TYPES = {"unsafe", "full"}


def loader_is_safe(node, where):
    if node is None:
        return False
    name = (dotted_name(node, where.context.aliases) or "").rsplit(".", 1)[-1]
    if name in SAFE_LOADERS:
        return True
    found = definition(node, where)
    if found is None:
        return not name.endswith(("Loader", "FullLoader", "UnsafeLoader"))
    bases = [dotted_name(b, found[1].context.aliases) or "" for b in found[0].bases]
    return any(base.rsplit(".", 1)[-1] in SAFE_LOADERS for base in bases)


def ruamel_unsafe(call):
    kind = keyword(call, "typ")
    if kind is None and call.args:
        kind = call.args[0]
    values = kind.elts if isinstance(kind, (ast.List, ast.Tuple)) else [kind]
    return any(isinstance(v, ast.Constant) and v.value in UNSAFE_TYPES for v in values)


def call_problem(call, context):
    name = dotted_name(call.func, context.aliases) or ""
    where = where_of(call, context)
    if name in ALWAYS_UNSAFE:
        return name
    if name == "yaml.load_all":
        return None if loader_is_safe(argument(call, 1, "Loader"), where) else name
    if name == "ruamel.yaml.YAML" and ruamel_unsafe(call):
        return name
    if name == "torch.load":
        weights = keyword(call, "weights_only")
        safe = isinstance(weights, ast.Constant) and weights.value is True
        return None if safe else name
    if name in {"numpy.load", "numpy.lib.npyio.load"}:
        allow = keyword(call, "allow_pickle")
        return name if allow is not None and can_be_true(allow, where) else None
    return None


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Call):
            problem = call_problem(node, context)
            if problem is not None:
                found.append(finding(context.path, RULE, problem, node))
    return found
