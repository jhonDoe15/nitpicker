import ast

from checks.common import dotted_name
from effect_kinds.clients import imports_celery, is_task_decorator
from kinds.index import functions_of
from kinds.names import chain_names
from kinds.receivers import callee_of

CELERY = "Celery task"
SCHEDULER = "APScheduler job"
COMMAND = "management command"
SCHEDULER_PACKAGE = "apscheduler"
SCHEDULING_METHODS = {"add_job"}
SCHEDULED_DECORATORS = {"scheduled_job"}
COMMAND_BASES = {
    "django.core.management.base.BaseCommand",
    "django.core.management.BaseCommand",
}
COMMAND_METHOD = "handle"


def imports_package(context, package):
    return any(
        value.split(".")[0] == package
        for table in context.aliases[:2]
        for value in table.values()
    )


def is_scheduled_job(function):
    return any(
        chain_names(decorator)[-1:] == [name]
        for decorator in function.decorator_list
        for name in SCHEDULED_DECORATORS
    )


def registered_jobs(project):
    def build(_):
        found = set()
        for context in project.contexts.values():
            if context.tests or not imports_package(context, SCHEDULER_PACKAGE):
                continue
            for node in ast.walk(context.tree):
                if isinstance(node, ast.Call):
                    found.update(registered_in(node, context))
        return found

    return project.memo("scheduled-jobs", build)


def registered_in(call, context):
    names = chain_names(call.func)
    if names[-1:] and names[-1] in SCHEDULING_METHODS:
        callables = call.args[:1] + [k.value for k in call.keywords if k.arg == "func"]
        resolved = (callee_of(c, context) for c in callables if isinstance(c, ast.Name))
        return {id(function) for function in resolved if function is not None}
    return set()


def project_classes(project):
    def build(_):
        found = {}
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if isinstance(node, ast.ClassDef):
                    found.setdefault(node.name, []).append((node, context))
        return {name: items[0] for name, items in found.items() if len(items) == 1}

    return project.memo("job-classes", build)


def is_command_class(cls, context, classes=None, depth=0):
    classes = project_classes(context.project) if classes is None else classes
    for base in cls.bases:
        if dotted_name(base, context.aliases) in COMMAND_BASES:
            return True
        name = base.id if isinstance(base, ast.Name) else getattr(base, "attr", None)
        if name in classes and depth < 5 and classes[name][0] is not cls:
            parent, parent_context = classes[name]
            if is_command_class(parent, parent_context, classes, depth + 1):
                return True
    return False


def command_methods(context):
    found = {}
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.ClassDef):
            continue
        if is_command_class(node, context):
            for member in node.body:
                if (
                    isinstance(member, ast.FunctionDef)
                    and member.name == COMMAND_METHOD
                ):
                    found[id(member)] = COMMAND
    return found


def job_kinds(context):
    registered = registered_jobs(context.project)
    commands = command_methods(context)
    celery = imports_celery(context)
    found = {}
    for _qualified, function in functions_of(context):
        if id(function) in commands:
            found[id(function)] = COMMAND
        elif id(function) in registered or (
            imports_package(context, SCHEDULER_PACKAGE) and is_scheduled_job(function)
        ):
            found[id(function)] = SCHEDULER
        elif celery and any(
            is_task_decorator(d, context) for d in function.decorator_list
        ):
            found[id(function)] = CELERY
    return found
