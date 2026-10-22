import ast

from checks.common import dotted_name, finding
from security.resolve.booleans import can_be_false, can_be_true, is_true
from security.resolve.calls import argument, effective_calls, keyword_entries, text_of
from security.resolve.scopes import MAX_HOPS, definition, values_of, where_of
from security.support import exempt

RULE = "unsafe-deserialization"
ALWAYS_UNSAFE = {
    "yaml.unsafe_load",
    "yaml.unsafe_load_all",
    "yaml.full_load",
    "yaml.full_load_all",
    "ruamel.yaml.unsafe_load",
    "ruamel.yaml.unsafe_load_all",
    "joblib.load",
    "cloudpickle.load",
    "cloudpickle.loads",
}
SAFE_LOADERS = {"SafeLoader", "CSafeLoader", "BaseLoader", "CBaseLoader"}
UNSAFE_LOADER_NAMES = ("Loader", "FullLoader", "UnsafeLoader")
UNSAFE_TYPES = {"unsafe", "full"}
NUMPY_LOADS = {"numpy.load", "numpy.lib.npyio.load"}
KERAS_LOADS = {
    "keras.models.load_model",
    "keras.saving.load_model",
    "tensorflow.keras.models.load_model",
    "tensorflow.keras.saving.load_model",
    "tf_keras.models.load_model",
}
LXML_PARSERS = {
    "lxml.etree.XMLParser",
    "lxml.etree.XMLPullParser",
    "lxml.objectify.makeparser",
}
RUAMEL = "ruamel.yaml.YAML"


def loader_is_safe(node, where, hops=0):
    if node is None or hops > MAX_HOPS:
        return False
    name = (dotted_name(node, where.context.aliases) or "").rsplit(".", 1)[-1]
    if name in SAFE_LOADERS:
        return True
    values = values_of(node.id, where) if isinstance(node, ast.Name) else []
    if values:
        return all(loader_is_safe(value, place, hops + 1) for value, place in values)
    found = definition(node, where)
    if found is None:
        return not name.endswith(UNSAFE_LOADER_NAMES)
    cls, place = found
    return any(loader_is_safe(base, place, hops + 1) for base in cls.bases)


def ruamel_unsafe(kind):
    values = kind.elts if isinstance(kind, (ast.List, ast.Tuple)) else [kind]
    return any(text_of(value) in UNSAFE_TYPES for value in values)


def keywords_of(call, where):
    return {
        key: (value, place)
        for key, value, place in keyword_entries(call.keywords, where).items
    }


def option_problem(call, name, where):
    options = keywords_of(call, where)
    if name == "torch.load":
        weights = options.get("weights_only")
        return None if weights is not None and is_true(*weights) else name
    if name in NUMPY_LOADS:
        allow = options.get("allow_pickle")
        return name if allow is not None and can_be_true(*allow) else None
    if name in KERAS_LOADS:
        safe = options.get("safe_mode")
        return name if safe is not None and can_be_false(*safe) else None
    if name in LXML_PARSERS:
        entities = options.get("resolve_entities")
        network = options.get("no_network")
        unsafe = (entities is not None and can_be_true(*entities)) or (
            network is not None and can_be_false(*network)
        )
        return name if unsafe else None
    return None


def call_problem(call, where):
    name = dotted_name(call.func, where.context.aliases) or ""
    if name in ALWAYS_UNSAFE:
        return name
    if name == "yaml.load_all":
        return None if loader_is_safe(argument(call, 1, "Loader"), where) else name
    if name == RUAMEL:
        return name if ruamel_unsafe(argument(call, 0, "typ")) else None
    return option_problem(call, name, where)


def made_by_ruamel(node, where):
    values = values_of(node.id, where) if isinstance(node, ast.Name) else []
    return any(
        isinstance(value, ast.Call)
        and dotted_name(value.func, place.context.aliases) == RUAMEL
        for value, place in values
    )


def assignment_problem(node, context):
    for target in node.targets:
        if (
            isinstance(target, ast.Attribute)
            and target.attr == "typ"
            and ruamel_unsafe(node.value)
        ):
            if made_by_ruamel(target.value, where_of(node, context)):
                return RUAMEL
    return None


def check(context):
    if exempt(context):
        return []
    found = []
    for node, call, where, _ in effective_calls(context, where_of):
        problem = call_problem(call, where)
        if problem is not None:
            found.append(finding(context.path, RULE, problem, node))
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Assign):
            problem = assignment_problem(node, context)
            if problem is not None:
                found.append(finding(context.path, RULE, problem, node))
    return found


def allowances(context):
    sites = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        if dotted_name(node.func, context.aliases) != "yaml.load":
            continue
        loader = argument(node, 1, "Loader")
        if loader is not None and loader_is_safe(loader, where_of(node, context)):
            sites.append({"rule": "S506", "path": context.path, "line": loader.lineno})
    return sites
