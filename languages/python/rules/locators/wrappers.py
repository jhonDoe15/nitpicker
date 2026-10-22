import ast

from checks.common import dotted_name
from locators.labels import is_allowed_here, lookup_label
from locators.model import OWNER_NAMES
from locators.resolve.references import reference_of, root_name
from locators.resolve.scopes import local_entries, own_nodes
from locators.resolve.symbols import ancestry, resolve_in, symbols


def helper_functions(project):
    def build(_):
        table = symbols(project)
        return {**table["functions"], **table["methods"]}

    return project.memo("locator-helpers", build)


def method_key(class_key, name, project, defined):
    for module, class_name in ancestry(project, class_key):
        if (module, f"{class_name}.{name}") in defined:
            return (module, f"{class_name}.{name}")
    return None


def owner_class_key(call, context):
    klass = context.parents.get(id(call))
    while klass is not None and not isinstance(klass, ast.ClassDef):
        klass = context.parents.get(id(klass))
    if klass is None:
        return None
    return (context.project.module_name(context.path), klass.name)


def attribute_callee(call, context, defined):
    func = call.func
    project = context.project
    if root_name(func) in OWNER_NAMES and isinstance(func.value, ast.Name):
        class_key = owner_class_key(call, context)
    else:
        reference = reference_of(func.value, context)
        class_key = reference[1] if reference and reference[0] == "object" else None
    return method_key(class_key, func.attr, project, defined) if class_key else None


def callee_key(call, context, defined):
    func = call.func
    if isinstance(func, ast.Name) and local_entries(func.id, call, context) is not None:
        return None
    if isinstance(func, ast.Attribute):
        method = attribute_callee(call, context, defined)
        if method:
            return method
    dotted = dotted_name(func, context.aliases)
    if not dotted:
        return None
    key = resolve_in(context, dotted, defined)
    if key:
        return key
    project = context.project
    class_key = resolve_in(context, dotted, symbols(project)["classes"])
    return method_key(class_key, "__init__", project, defined) if class_key else None


def own_label(function, context):
    for node in own_nodes(function):
        label = lookup_label(node, context)
        if label:
            return label
    return None


def own_callees(function, context, defined):
    return [
        target
        for node in own_nodes(function)
        if isinstance(node, ast.Call) and not is_allowed_here(node, context)
        for target in [callee_key(node, context, defined)]
        if target
    ]


def wrapper_labels(project):
    def build(_):
        functions = helper_functions(project)
        labels = {}
        callees = {}
        for key, (context, function) in functions.items():
            label = own_label(function, context)
            if label:
                labels[key] = label
            else:
                callees[key] = own_callees(function, context, functions)
        changed = True
        while changed:
            changed = False
            for key, targets in callees.items():
                inherited = next((labels[t] for t in targets if t in labels and t != key), None)
                if inherited and key not in labels:
                    labels[key] = inherited
                    changed = True
        return labels

    return project.memo("locator-wrappers", build)


def wrapper_label(node, context):
    if not isinstance(node, ast.Call):
        return None
    functions = helper_functions(context.project)
    key = callee_key(node, context, functions)
    label = wrapper_labels(context.project).get(key)
    if not label or is_allowed_here(node, context):
        return None
    return label, functions[key][0].path
