import ast

from checks.common import dotted_name
from environment.roots import is_composition_root
from locators.labels import in_composition_scope, lookup_label
from locators.references import follow


def module_functions(project):
    def build(_):
        found = {}
        for context in project.contexts.values():
            if context.tests or is_composition_root(context):
                continue
            module = project.module_name(context.path)
            for node in context.tree.body:
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    found[(module, node.name)] = (context, node)
        return found

    return project.memo("locator-functions", build)


def callee_key(call, context, defined):
    dotted = dotted_name(call.func, context.aliases)
    if not dotted:
        return None
    own = (context.project.module_name(context.path), dotted)
    return own if own in defined else follow(context.project, dotted, defined)


def own_label(function, context):
    for node in ast.walk(function):
        label = lookup_label(node, context)
        if label:
            return label
    return None


def inherited_label(key, context, function, labels, defined):
    for node in ast.walk(function):
        if not isinstance(node, ast.Call) or in_composition_scope(node, context):
            continue
        target = callee_key(node, context, defined)
        if target in labels and target != key:
            return labels[target]
    return None


def wrapper_labels(project):
    def build(_):
        functions = module_functions(project)
        labels = {}
        for key, (context, function) in functions.items():
            label = own_label(function, context)
            if label:
                labels[key] = label
        changed = True
        while changed:
            changed = False
            for key, (context, function) in functions.items():
                label = (
                    None
                    if key in labels
                    else inherited_label(key, context, function, labels, functions)
                )
                if label:
                    labels[key] = label
                    changed = True
        return labels

    return project.memo("locator-wrappers", build)


def wrapper_label(node, context):
    if not isinstance(node, ast.Call) or in_composition_scope(node, context):
        return None
    labels = wrapper_labels(context.project)
    key = callee_key(node, context, module_functions(context.project))
    return labels.get(key)
