import ast

from checks.common import dotted_name, finding
from environment.roots import is_composition_root

ENVIRONMENT_NAMES = {
    "os.environ",
    "os.environb",
    "os.getenv",
    "os.getenvb",
    "os.putenv",
    "os.unsetenv",
    "posix.environ",
    "nt.environ",
    "dotenv.dotenv_values",
    "dotenv.load_dotenv",
    "decouple.config",
    "decouple.AutoConfig",
    "environs.Env",
    "envparse.env",
}
ENVIRONMENT_ATTRIBUTES = {"environ", "environb", "getenv", "getenvb"}
SETTINGS_BASES = {"pydantic_settings.BaseSettings", "pydantic.BaseSettings"}
HARMLESS_DEFAULTS = {"DJANGO_SETTINGS_MODULE"}
MODULE_LOADERS = {"importlib.import_module", "__import__"}


def is_name_check(test):
    if not (isinstance(test, ast.Compare) and len(test.comparators) == 1):
        return False
    if not isinstance(test.ops[0], ast.Eq):
        return False
    sides = [test.left, test.comparators[0]]
    names = [side for side in sides if isinstance(side, ast.Name)]
    texts = [side for side in sides if isinstance(side, ast.Constant)]
    return (
        len(names) == 1
        and names[0].id == "__name__"
        and len(texts) == 1
        and texts[0].value == "__main__"
    )


def is_main_guard(node):
    test = node.test
    if isinstance(test, ast.BoolOp) and isinstance(test.op, ast.And):
        return any(is_name_check(value) for value in test.values)
    return is_name_check(test)


def guarded_nodes(tree):
    inside = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.If) and is_main_guard(node):
            inside.update(id(child) for part in node.body for child in ast.walk(part))
    return inside


def string_argument(call):
    first = call.args[0] if call.args else None
    return first.value if isinstance(first, ast.Constant) else None


def module_named(node, aliases):
    if isinstance(node, ast.Subscript):
        owner = dotted_name(node.value, aliases)
        key = node.slice
        if owner == "sys.modules" and isinstance(key, ast.Constant):
            return key.value
    if isinstance(node, ast.Call):
        if dotted_name(node.func, aliases) in MODULE_LOADERS:
            return string_argument(node)
    return None


def is_default_only(node, parents, aliases):
    call = parents.get(id(node))
    holder = call if isinstance(call, ast.Attribute) else None
    outer = parents.get(id(holder)) if holder is not None else None
    return (
        holder is not None
        and holder.attr == "setdefault"
        and isinstance(outer, ast.Call)
        and string_argument(outer) in HARMLESS_DEFAULTS
    )


def settings_classes(project):
    def build(_):
        found = set()
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if isinstance(node, ast.ClassDef) and extends_settings(node, context):
                    found.add((project.module_name(context.path), node.name))
        return found

    return project.memo("settings-classes", build)


def extends_settings(node, context):
    return any(
        dotted_name(base, context.aliases) in SETTINGS_BASES for base in node.bases
    )


def instantiated_settings(node, context):
    if not isinstance(node, ast.Call):
        return None
    name = dotted_name(node.func, context.aliases) or ""
    located = context.project.locate(name) if "." in name else None
    own = (context.project.module_name(context.path), name)
    classes = settings_classes(context.project)
    if own in classes:
        return name
    if located is not None:
        module = context.project.module_name(located[0])
        return name if (module, located[1]) in classes else None
    return None


def attribute_access(node, context):
    if not isinstance(node, ast.Attribute) or node.attr not in ENVIRONMENT_ATTRIBUTES:
        return None
    module = module_named(node.value, context.aliases)
    return f"{module}.{node.attr}" if module in {"os", "posix", "nt"} else None


def getattr_access(node, context):
    if not (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "getattr"
        and len(node.args) >= 2
    ):
        return None
    owner = dotted_name(node.args[0], context.aliases)
    key = node.args[1]
    if owner in {"os", "posix", "nt"} and isinstance(key, ast.Constant):
        return f"{owner}.{key.value}" if key.value in ENVIRONMENT_ATTRIBUTES else None
    return None


def access_name(node, context):
    reads = isinstance(node, ast.Attribute) or (
        isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load)
    )
    name = dotted_name(node, context.aliases) if reads else None
    if name in ENVIRONMENT_NAMES and not is_default_only(
        node, context.parents, context.aliases
    ):
        return name
    return (
        attribute_access(node, context)
        or getattr_access(node, context)
        or instantiated_settings(node, context)
    )


def check(context):
    if context.tests or is_composition_root(context):
        return []
    guarded = guarded_nodes(context.tree)
    found = []
    for node in ast.walk(context.tree):
        name = access_name(node, context)
        if name and id(node) not in guarded:
            found.append(finding(context.path, "process-env-access", name, node))
    return found
