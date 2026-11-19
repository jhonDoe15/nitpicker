import ast

from checks.common import finding
from persistence.memory.check import enclosing, is_skipped
from persistence.memory.models import model_columns
from persistence.memory.results import is_session_like, method_call, unawaited
from persistence.updates.hooks import class_chain
from persistence.updates.loops import commits
from persistence.updates.rows import SQLALCHEMY, rows_of

RULE = "unversioned-orm-entity"
GUARDED = True
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
ONE_ROW = {"first", "one", "one_or_none", "scalar", "scalar_one", "scalar_one_or_none"}
BY_KEY = {"get", "get_one"}
VERSION_KEY = "version_id_col"
SAVED = {"add", "merge"}


def single_row(node):
    call = method_call(node, ONE_ROW)
    return unawaited(call.func.value) if call is not None and not call.args else node


def keyed_model(node, context):
    call = method_call(node, BY_KEY)
    if call is None or len(call.args) < 1 or not isinstance(call.args[0], ast.Name):
        return None
    name = call.args[0].id
    known = name[:1].isupper() and is_session_like(call.func.value, context)
    return name if known else None


def loaded_model(node, context):
    node = unawaited(node)
    keyed = keyed_model(node, context)
    if keyed is not None:
        return keyed
    found = rows_of(single_row(node), context)
    return found[0].model if found is not None and found[1] == SQLALCHEMY else None


def is_locked(value):
    return any(
        (isinstance(node, ast.Attribute) and node.attr == "with_for_update")
        or (isinstance(node, ast.keyword) and node.arg == "with_for_update")
        for node in ast.walk(value)
    )


def loaded_names(function, context):
    names = {}
    for node in ast.walk(function):
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target, value = node.targets[0], node.value
        elif isinstance(node, (ast.For, ast.AsyncFor)):
            target, value = node.target, node.iter
        else:
            continue
        model = (
            loaded_model(value, context)
            if isinstance(target, ast.Name) and not is_locked(value)
            else None
        )
        if model is not None:
            names[target.id] = model
    return names


def changed_names(function):
    changed = set()
    for node in ast.walk(function):
        if isinstance(node, ast.AugAssign):
            targets = [node.target]
        elif isinstance(node, ast.Assign):
            targets = node.targets
        else:
            continue
        changed.update(
            target.value.id
            for target in targets
            if isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name)
        )
    return changed


def is_saved(function):
    calls = [node for node in ast.walk(function) if isinstance(node, ast.Call)]
    flushed = commits(calls) is not None
    added = any(
        isinstance(call.func, ast.Attribute) and call.func.attr in SAVED for call in calls
    )
    return flushed or added


def is_versioned(context, model):
    return any(
        (isinstance(node, ast.Constant) and node.value == VERSION_KEY)
        or (isinstance(node, ast.keyword) and node.arg == VERSION_KEY)
        for cls in class_chain(context, model)
        for node in ast.walk(cls)
    )


def check(context):
    if is_skipped(context):
        return []
    found, seen = [], set()
    for function in (node for node in ast.walk(context.tree) if isinstance(node, FUNCTIONS)):
        if enclosing(function, context, FUNCTIONS) is not None:
            continue
        loaded = loaded_names(function, context)
        updated = {loaded[name] for name in changed_names(function) & set(loaded)}
        for model in sorted(updated if is_saved(function) else ()):
            if model in seen or not model_columns(context, model):
                continue
            if not is_versioned(context, model):
                seen.add(model)
                found.append(finding(context.path, RULE, model, function))
    return found
