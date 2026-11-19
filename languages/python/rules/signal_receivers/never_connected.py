import ast

from checks.common import finding, imported_module, last_name, words_of
from signal_receivers.receivers import project_receivers

RULE = "signal-receiver-never-connected"
GUARDED = True
MODULE_WORDS = {"signal", "signals", "receiver", "receivers"}
IMPORTERS = {"import_module", "autodiscover_modules"}


def from_targets(node, context):
    module = imported_module(node, context.project, context.path)
    if node.level and not node.module:
        module = context.project.relative_module(
            context.path, node.level, None, existing=False
        )
    if module:
        yield module
    for alias in node.names:
        yield f"{module}.{alias.name}" if module else alias.name


def import_targets(context):
    for node in ast.walk(context.tree):
        if isinstance(node, ast.Import):
            yield from (alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            yield from from_targets(node, context)
        elif isinstance(node, ast.Call) and last_name(node.func) in IMPORTERS:
            yield from (
                arg.value
                for arg in node.args
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str)
            )


def imported_paths(project):
    def build(_):
        found = {}
        for context in project.contexts.values():
            if context.tests:
                continue
            for target in import_targets(context):
                path = project.module_path(target)
                if path is not None and path != context.path:
                    found.setdefault(path, set()).add(context.path)
        return found

    return project.memo("imported-paths", build)


def loads_dynamically(project):
    def build(_):
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if not isinstance(node, ast.Call):
                    continue
                name = last_name(node.func)
                if name == "autodiscover_modules":
                    return True
                if name == "import_module" and not is_text(node.args[:1]):
                    return True
        return False

    return project.memo("dynamic-imports", build)


def is_text(arguments):
    return bool(arguments) and isinstance(arguments[0], ast.Constant)


def has_app_config(project):
    def build(_):
        return any(
            last_name(base) == "AppConfig"
            for context in project.contexts.values()
            for node in ast.walk(context.tree)
            if isinstance(node, ast.ClassDef)
            for base in node.bases
        )

    return project.memo("app-config", build)


def is_signal_module(path):
    stem = path.rsplit("/", 1)[-1].removesuffix(".py")
    return bool(set(words_of(stem)) & MODULE_WORDS)


def check(context):
    project = context.project
    if context.tests or not is_signal_module(context.path):
        return []
    if not has_app_config(project) or context.path in imported_paths(project):
        return []
    if loads_dynamically(project):
        return []
    module = project.module_name(context.path)
    return [
        finding(
            context.path,
            RULE,
            f"{receiver.function.name}|{sorted(receiver.signals)[0]}|{module}",
            receiver.function,
        )
        for receiver in project_receivers(project)
        if receiver.context is context
    ]
