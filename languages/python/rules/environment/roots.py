import ast
import os

ENTRY_STEMS = {
    "main",
    "__main__",
    "server",
    "composition_root",
    "manage",
    "wsgi",
    "asgi",
    "cli",
    "app",
    "application",
    "celery",
    "bootstrap",
    "worker",
}
ROOT_FILE_STEMS = {"tasks", "fabfile", "noxfile", "setup", "conftest"}
CONFIG_STEMS = {"config", "settings", "conf", "configuration"}
CONFIG_SUFFIXES = ("_config", "_conf", "_settings", ".conf")
CONFIG_PREFIXES = ("settings_", "config_")
ROOT_DIRECTORIES = {"composition_root", "settings", "config", "conf"}
FACTORY_NAMES = {
    "create_app",
    "make_app",
    "build_app",
    "create_application",
    "app_factory",
}
LAYOUT_DIRECTORY = "domain"


def stem_of(path):
    name = os.path.basename(path)
    return name[: -len(".py")] if name.endswith(".py") else name


def is_config_name(stem):
    return (
        stem in CONFIG_STEMS
        or stem.endswith(CONFIG_SUFFIXES)
        or stem.startswith(CONFIG_PREFIXES)
    )


def is_migration_environment(path):
    directory = os.path.dirname(path)
    return stem_of(path) == "env" and os.path.isfile(
        os.path.join(directory, "script.py.mako")
    )


def defines_factory(tree):
    return any(
        isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name in FACTORY_NAMES
        for node in tree.body
    )


def is_listed_entry(context):
    project = context.project
    options = context.options
    module = project.module_name(context.path)
    return context.path in options.get("entryFiles", []) or module in options.get(
        "entryModules", []
    )


def is_named_root(context):
    path = context.path
    stem = stem_of(path)
    parts = path.split("/")[:-1]
    if LAYOUT_DIRECTORY in parts:
        return False
    if stem in ENTRY_STEMS:
        return True
    if stem in ROOT_FILE_STEMS and len(parts) == 0:
        return True
    return is_config_name(stem) or bool(ROOT_DIRECTORIES.intersection(parts))


def is_composition_root(context):
    return (
        is_listed_entry(context)
        or is_named_root(context)
        or is_migration_environment(context.path)
        or defines_factory(context.tree)
    )
