import os

from environment.roots import is_composition_root, is_listed_entry

ROOT_FILES = {"main.py", "server.py", "composition_root.py"}
INIT = "__init__.py"
ROOT_FOLDER = "composition_root"


def is_root_package(context, folder):
    paths = context.project.paths
    parent = os.path.dirname(folder)
    return os.path.join(folder, INIT) in paths and (
        not parent or os.path.join(parent, INIT) not in paths
    )


def is_wiring_root(context):
    folder = os.path.dirname(context.path)
    if is_listed_entry(context):
        return True
    if os.path.basename(context.path) in ROOT_FILES:
        return is_root_package(context, folder)
    return os.path.basename(folder) == ROOT_FOLDER and is_root_package(
        context, os.path.dirname(folder)
    )


def starts_program(context):
    return is_wiring_root(context) or is_composition_root(context)
