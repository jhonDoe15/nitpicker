import ast
from collections import namedtuple

from checks.common import walk_statements, words_of
from deleted_items.types import item_types, self_attributes, typed_names
from kinds.index import functions_of
from security.resolve.scopes import enclosing_class
from soft_delete.fields import helper_names, mentions

Iteration = namedtuple("Iteration", "item field guarded via node function")
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
LOOPS = (ast.For, ast.AsyncFor)
CALLBACKS = {"filter"}
INTENT_WORDS = {
    "trash",
    "trashed",
    "restore",
    "purge",
    "cleanup",
    "undelete",
    "recycle",
    "deleted",
    "admin",
    "hard",
    "undo",
    "redo",
    "sync",
    "snapshot",
    "history",
    "reconcile",
    "serialize",
    "export",
}


def is_intentional(qualified):
    words = {word for part in qualified.split(".") for word in words_of(part)}
    return bool(words & INTENT_WORDS)


INCLUDING_WORDS = {"including", "include", "includes", "with"}


COLLECTION_NOUNS = {"items", "elements", "list", "rows", "records", "entries", "nodes"}


def names_include_deleted(text):
    words = words_of(text.replace(".", "_")) if text else []
    if words and words[-1] in COLLECTION_NOUNS:
        words = words[:-1]
    return (
        len(words) >= 2 and words[-1] == "deleted" and words[-2] in INCLUDING_WORDS
    )


def reference_text(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        return f"{node.value.id}.{node.attr}"
    return None


def helper_source(node, typed, helpers):
    if not isinstance(node, ast.Call):
        return None
    name = (
        node.func.id
        if isinstance(node.func, ast.Name)
        else getattr(node.func, "attr", None)
    )
    if name not in helpers:
        return None
    for argument in node.args:
        key = reference_text(argument)
        if key in typed:
            return typed[key][0][0], f"{name}()"
    return None


def is_copy(node):
    if isinstance(node, ast.DictComp):
        return True
    first = node.generators[0]
    return (
        not any(g.ifs for g in node.generators)
        and isinstance(node.elt, ast.Name)
        and isinstance(first.target, ast.Name)
        and node.elt.id == first.target.id
    )


def iterables(function):
    for node in walk_statements(function.body):
        if isinstance(node, LOOPS):
            yield node, node.iter, node
        elif isinstance(node, COMPREHENSIONS) and not is_copy(node):
            for generator in node.generators:
                yield node, generator.iter, node
        elif isinstance(node, ast.Call) and node.args:
            name = node.func.id if isinstance(node.func, ast.Name) else None
            if name in CALLBACKS:
                yield node, node.args[-1], node


def classify(source, typed, helpers, types):
    found = helper_source(source, typed, helpers)
    if found is not None:
        return found[0], True, found[1]
    key = reference_text(source)
    if key not in typed:
        return None
    name, narrowed_by = typed[key][0]
    return name, narrowed_by is not None, narrowed_by


def iterations_of(context):
    def build(_):
        project = context.project
        types, helpers = item_types(project), helper_names(project)
        found = []
        for qualified, function in functions_of(context):
            if is_intentional(qualified):
                continue
            owner = enclosing_class(function, context)
            attributes = self_attributes(owner, types) if owner is not None else {}
            typed = {
                key: (item, None)
                for key, item in typed_names(
                    function, context, types, attributes
                ).items()
            }
            for node, source, region in iterables(function):
                if names_include_deleted(reference_text(source)):
                    continue
                verdict = classify(source, typed, helpers, types)
                if verdict is None:
                    continue
                name, narrowed, via = verdict
                fields = types[name]
                guarded = narrowed or mentions(region, fields)
                field = next(
                    (f for f in sorted(fields) if mentions(region, {f})),
                    sorted(fields)[0],
                )
                found.append(
                    Iteration(name, field, guarded, via or field, node, qualified)
                )
        return found

    return context.project.memo(("deleted-iterations", context.path), build)
