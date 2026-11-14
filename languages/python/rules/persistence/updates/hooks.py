import ast

from checks.common import last_name
from persistence.memory.models import located_class

DJANGO_SIGNALS = {"pre_save", "post_save"}
ALCHEMY_EVENTS = {
    "before_update",
    "after_update",
    "before_flush",
    "after_flush",
    "after_flush_postexec",
}
HOOK_METHODS = {"save"}
HOOK_DECORATORS = {"validates"}
VERSION_NAMES = {"version", "version_id", "row_version", "revision"}
VERSION_CALLS = {"HistoricalRecords", "VersionField", "IntegerVersionField"}
VERSION_KEY = "version_id_col"
TIMESTAMP_OPTIONS = {"auto_now", "auto_now_add"}
BASE_DEPTH = 4
EVENT_ARGUMENTS = 2
EVERYTHING = "*"


def class_chain(context, name, depth=0):
    cls, owner = located_class(context, name)
    if cls is None or depth > BASE_DEPTH:
        return
    yield cls
    for base in cls.bases:
        if isinstance(base, ast.Name):
            yield from class_chain(owner, base.id, depth + 1)


def has_option(call, names):
    return any(
        item.arg in names
        and isinstance(item.value, ast.Constant)
        and item.value.value is True
        for item in call.keywords
    )


def is_hook_member(item):
    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
        decorated = {
            last_name(d.func if isinstance(d, ast.Call) else d)
            for d in item.decorator_list
        }
        return item.name in HOOK_METHODS or bool(decorated & HOOK_DECORATORS)
    targets = (
        item.targets
        if isinstance(item, ast.Assign)
        else [getattr(item, "target", None)]
    )
    names = {t.id for t in targets if isinstance(t, ast.Name)}
    value = getattr(item, "value", None)
    if names & VERSION_NAMES:
        return True
    if isinstance(value, ast.Call):
        return last_name(value.func) in VERSION_CALLS or has_option(
            value, TIMESTAMP_OPTIONS
        )
    return False


def is_hooked_class(cls):
    if any(is_hook_member(item) for item in cls.body):
        return True
    return any(
        (isinstance(node, ast.Constant) and node.value == VERSION_KEY)
        or (isinstance(node, ast.keyword) and node.arg == VERSION_KEY)
        for node in ast.walk(cls)
    )


def sender_name(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value.rsplit(".", 1)[-1]
    return last_name(node)


def signal_names(node):
    items = node.elts if isinstance(node, (ast.List, ast.Tuple)) else [node]
    return {last_name(item) for item in items}


def keyword_value(call, name):
    return next((item.value for item in call.keywords if item.arg == name), None)


def django_hook(call):
    name = last_name(call.func)
    if name == "receiver" and call.args:
        signals = signal_names(call.args[0])
    elif name == "connect" and isinstance(call.func, ast.Attribute):
        signals = {last_name(call.func.value)}
    else:
        return None
    if not signals & DJANGO_SIGNALS:
        return None
    sender = keyword_value(call, "sender")
    return (sender_name(sender) if sender is not None else None) or EVERYTHING


def alchemy_hook(call):
    if (
        last_name(call.func) not in {"listens_for", "listen"}
        or len(call.args) < EVENT_ARGUMENTS
    ):
        return None
    event = call.args[1]
    is_update = isinstance(event, ast.Constant) and event.value in ALCHEMY_EVENTS
    target = call.args[0]
    return (
        (target.id if isinstance(target, ast.Name) else EVERYTHING)
        if is_update
        else None
    )


def project_hooks(project):
    def build(_):
        names = set()
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if isinstance(node, ast.Call):
                    names.add(django_hook(node) or alchemy_hook(node))
        return names - {None}

    return project.memo("update-hooks", build)


def has_hooks(context, model):
    hooked = project_hooks(context.project)
    if EVERYTHING in hooked or model in hooked:
        return True
    return any(is_hooked_class(cls) for cls in class_chain(context, model))
