import ast

from checks.common import dotted_name, finding, last_name
from index.scopes import enclosing_function
from sharing.classes import SELF, changed_attributes, methods_of
from sharing.mutations import changed_keys
from sharing.values import RULE, shared_value
from signatures.annotations import decorator_names, members_of

INIT = "__init__"


def class_index(project):
    def build(_):
        index = {}
        for path, context in project.contexts.items():
            if path in project.test_files:
                continue
            for node in ast.walk(context.tree):
                if isinstance(node, ast.ClassDef):
                    index.setdefault(node.name, []).append((node, context))
        return index

    return project.memo(("shared-class-index",), build)


def top_level_class(path, name, project):
    context = project.contexts.get(path)
    for node in context.tree.body if context else []:
        if isinstance(node, ast.ClassDef) and node.name == name:
            return node
    return None


def find_class(func, context):
    name = last_name(func)
    if not name:
        return None
    module, _, _ = (dotted_name(func, context.aliases) or "").rpartition(".")
    if module:
        path = context.project.module_path(module)
        return top_level_class(path, name, context.project) if path else None
    local = top_level_class(context.path, name, context.project)
    return local or unique_class(name, context)


def unique_class(name, context):
    matches = class_index(context.project).get(name, [])
    return matches[0][0] if len(matches) == 1 else None


def init_of(cls):
    return next((item for item in methods_of(cls) if item.name == INIT), None)


def dataclass_fields(cls):
    return [
        item.target.id
        for item in cls.body
        if isinstance(item, ast.AnnAssign)
        and isinstance(item.target, ast.Name)
        and "ClassVar" not in members_of(item.annotation)
    ]


def parameter_names(init):
    arguments = init.args
    every = [*arguments.posonlyargs, *arguments.args]
    return [argument.arg for argument in every][1:], [
        argument.arg for argument in arguments.kwonlyargs
    ]


def stored_parameters(init):
    found = {}
    for node in ast.walk(init):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Name):
            for target in node.targets:
                if (
                    isinstance(target, ast.Attribute)
                    and isinstance(target.value, ast.Name)
                    and target.value.id == SELF
                ):
                    found[node.value.id] = target.attr
    return found


def constructor_shape(cls):
    if "dataclass" in decorator_names(cls):
        fields = dataclass_fields(cls)
        return fields, {name: name for name in fields}
    init = init_of(cls)
    if init is None:
        return [], {}
    positional, keyword = parameter_names(init)
    return [*positional, *keyword], stored_parameters(init)


def changing_parameters(cls, kinds):
    init = init_of(cls)
    if init is None:
        return set()
    return changed_keys(init, kinds)


def received_by(cls, parameter, kind):
    order, stored = constructor_shape(cls)
    attribute = stored.get(parameter)
    if attribute is None:
        return False
    if attribute in changed_attributes(cls, {attribute: kind}):
        return True
    return parameter in changing_parameters(cls, {parameter: kind})


def argument_pairs(call, order):
    pairs = [(order[index], value) for index, value in enumerate(call.args) if index < len(order)]
    return pairs + [(item.arg, item.value) for item in call.keywords if item.arg]


def call_findings(call, context):
    cls = find_class(call.func, context)
    if cls is None:
        return []
    order, _ = constructor_shape(cls)
    function = enclosing_function(call, context.parents)
    found = []
    for parameter, value in argument_pairs(call, order):
        kind = shared_value(value, context, function)
        if kind and received_by(cls, parameter, kind):
            subject = f"{ast.unparse(value)} in {cls.name}"
            found.append(finding(context.path, RULE, subject, call))
    return found


def stored_findings(cls, context):
    found = []
    for method in methods_of(cls):
        for node in ast.walk(method):
            if not (isinstance(node, ast.Assign) and len(node.targets) == 1):
                continue
            target = node.targets[0]
            kind = shared_value(node.value, context, method)
            is_attribute = (
                isinstance(target, ast.Attribute)
                and isinstance(target.value, ast.Name)
                and target.value.id == SELF
            )
            if (
                kind
                and is_attribute
                and target.attr in changed_attributes(cls, {target.attr: kind})
            ):
                subject = f"{ast.unparse(node.value)} in {cls.name}"
                found.append(finding(context.path, RULE, subject, node))
    return found


def receiver_findings(context):
    calls = [node for node in ast.walk(context.tree) if isinstance(node, ast.Call)]
    stored = [
        item
        for cls in ast.walk(context.tree)
        if isinstance(cls, ast.ClassDef)
        for item in stored_findings(cls, context)
    ]
    return [*stored, *[item for call in calls for item in call_findings(call, context)]]
