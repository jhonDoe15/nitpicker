import ast

from checks.common import dotted_name, last_name, words_of
from kinds.index import functions_of
from signal_receivers.receivers import function_calls
from transactions.cache_clients import DJANGO_CACHES, cache_label

DIRECT_METHODS = {"delete", "delete_many", "delete_pattern", "clear"}
CACHE_WORDS = {"cache", "caches"}


def has_cache_name(owner):
    words = words_of(last_name(owner) or "")
    return bool(words) and words[-1] in CACHE_WORDS


def is_cache_owner(call, context):
    owner = call.func.value
    base = owner.value if isinstance(owner, ast.Subscript) else owner
    if dotted_name(base, context.aliases) in DJANGO_CACHES:
        return True
    return cache_label(call, context) in DIRECT_METHODS or has_cache_name(owner)


def helper_signature(name, context):
    words = words_of(name)
    if "cache" in words and ("invalidate" in words or "clear" in words):
        return f"{name}()"
    if "invalidate" not in words:
        return None
    defined = project_functions(context.project).get(name, [])
    if len(defined) == 1 and cache_signatures(*defined[0]):
        return f"{name}()"
    return None


def cache_signature(call, context):
    function = call.func
    name = last_name(function)
    if name is None or not isinstance(function, ast.Attribute):
        return None
    if name == "cache_clear":
        return f"{ast.unparse(function.value)}.cache_clear()"
    if name in DIRECT_METHODS and is_cache_owner(call, context):
        return ast.unparse(function.value)
    return None


def cache_signatures(function, context):
    return {
        found
        for call in function_calls(function)
        if (found := cache_signature(call, context))
    }


def call_signature(call, context):
    found = cache_signature(call, context)
    name = last_name(call.func)
    if found or name is None:
        return found
    return helper_signature(name, context)


def direct_signatures(function, context):
    return {
        found
        for call in function_calls(function)
        if (found := call_signature(call, context))
    }


def project_functions(project):
    def build(_):
        found = {}
        for context in project.contexts.values():
            if context.tests:
                continue
            for _, function in functions_of(context):
                found.setdefault(function.name, []).append((function, context))
        return found

    return project.memo("signal-functions", build)


def reached_signatures(function, context):
    found = direct_signatures(function, context)
    functions = project_functions(context.project)
    for call in function_calls(function):
        name = last_name(call.func)
        defined = functions.get(name, [])
        if len(defined) == 1 and defined[0][0] is not function:
            found |= direct_signatures(*defined[0])
    return found
