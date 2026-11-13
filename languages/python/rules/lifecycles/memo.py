import ast

from checks.common import dotted_name, finding
from lifecycles.scopes import FUNCTIONS, self_attribute

RULE = "cached-rejection"
CACHES = {"functools.cache", "functools.lru_cache", "functools.cached_property"}
TASK_FACTORIES = {"create_task", "ensure_future", "create_future", "Future"}
STALE_SUFFIX = "cleared without checking it is still this attempt"


def decorator_target(decorator):
    return decorator.func if isinstance(decorator, ast.Call) else decorator


def cached_async_functions(context):
    for node in ast.walk(context.tree):
        if isinstance(node, ast.AsyncFunctionDef):
            for decorator in node.decorator_list:
                if dotted_name(decorator_target(decorator), context.aliases) in CACHES:
                    yield node


def factory_name(call):
    func = call.func
    return func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")


def stored_attempts(cls):
    stored = {}
    for node in ast.walk(cls):
        if (
            isinstance(node, ast.Assign)
            and isinstance(node.value, ast.Call)
            and factory_name(node.value) in TASK_FACTORIES
        ):
            for target in node.targets:
                name = self_attribute(target)
                if name is not None:
                    stored.setdefault(name, node)
    return stored


def is_reused(cls, name):
    for node in ast.walk(cls):
        if isinstance(node, ast.Return) and node.value is not None:
            value = node.value.value if isinstance(node.value, ast.Await) else node.value
            if self_attribute(value) == name:
                return True
    return False


def clears(cls, name):
    return [
        node
        for node in ast.walk(cls)
        if isinstance(node, ast.Assign)
        and any(self_attribute(target) == name for target in node.targets)
        and isinstance(node.value, ast.Constant)
        and node.value.value is None
    ]


def ancestors(context, node):
    parent = context.parents.get(id(node))
    while parent is not None:
        yield parent
        parent = context.parents.get(id(parent))


def callback_names(cls):
    names = set()
    for node in ast.walk(cls):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in {"add_done_callback", "catch", "add_errback"}
        ):
            for argument in node.args:
                if isinstance(argument, ast.Attribute):
                    names.add(argument.attr)
                elif isinstance(argument, ast.Name):
                    names.add(argument.id)
                elif isinstance(argument, ast.Lambda):
                    names.add(id(argument))
    return names


def on_rejection_path(context, node, callbacks):
    for ancestor in ancestors(context, node):
        if isinstance(ancestor, ast.ExceptHandler):
            return True
        if isinstance(ancestor, ast.Lambda) and id(ancestor) in callbacks:
            return True
        if isinstance(ancestor, FUNCTIONS) and ancestor.name in callbacks:
            return True
    return False


def checks_identity(context, node, name):
    for ancestor in ancestors(context, node):
        if isinstance(ancestor, ast.If) and any(
            self_attribute(child) == name for child in ast.walk(ancestor.test)
        ):
            return any(
                isinstance(child, ast.Compare)
                and any(isinstance(op, (ast.Is, ast.Eq)) for op in child.ops)
                and any(self_attribute(part) == name for part in [child.left, *child.comparators])
                and not any(
                    isinstance(part, ast.Constant) and part.value is None
                    for part in [child.left, *child.comparators]
                )
                for child in ast.walk(ancestor.test)
            )
    return False


def class_findings(context, cls):
    found = []
    callbacks = callback_names(cls)
    for name, node in stored_attempts(cls).items():
        if not is_reused(cls, name):
            continue
        rejection = [
            clear for clear in clears(cls, name) if on_rejection_path(context, clear, callbacks)
        ]
        if not rejection:
            found.append(finding(context.path, RULE, f"{cls.name}.{name}: rejection stays cached", node))
        elif not all(checks_identity(context, clear, name) for clear in rejection):
            found.append(finding(context.path, RULE, f"{cls.name}.{name}: {STALE_SUFFIX}", rejection[0]))
    return found


def check(context):
    found = [
        finding(context.path, RULE, f"{function.name}: functools cache on an async function", function)
        for function in cached_async_functions(context)
    ]
    for cls in (node for node in ast.walk(context.tree) if isinstance(node, ast.ClassDef)):
        found.extend(class_findings(context, cls))
    return found
