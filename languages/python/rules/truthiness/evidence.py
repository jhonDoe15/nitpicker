import ast

from checks.common import last_name
from signatures.annotations import FUNCTION_TYPES, members_of, parameters_of

STATIC = {"staticmethod"}
GENERIC = "its type is a type variable, so `0`, `''` and `False` are valid values"
LITERAL = "its type names `''` or `False` as a valid value"
ASSIGNED = "`''`, `0` or `False` is assigned or passed for it elsewhere in the project or its tests"


def is_falsy_literal(node):
    if not isinstance(node, ast.Constant) or isinstance(node.value, (bytes, type(None))):
        return False
    return node.value is False or node.value == "" or (
        isinstance(node.value, (int, float)) and node.value == 0
    )


def literal_values(annotation):
    if isinstance(annotation, ast.Constant) and isinstance(annotation.value, str):
        try:
            annotation = ast.parse(annotation.value.strip(), mode="eval").body
        except (SyntaxError, ValueError, RecursionError, MemoryError):
            return []
    return [
        value
        for node in ast.walk(annotation)
        if isinstance(node, ast.Subscript) and last_name(node.value) == "Literal"
        for value in ast.walk(node.slice)
        if isinstance(value, ast.Constant)
    ]


def is_string_literal_annotation(annotation):
    values = literal_values(annotation)
    return bool(values) and all(isinstance(v.value, (str, bool)) for v in values)


def has_falsy_literal(annotation):
    return any(
        v.value is False or v.value == "" for v in literal_values(annotation)
        if isinstance(v.value, (str, bool))
    )


def type_variables(context, function):
    names = {
        target.id
        for node in context.tree.body
        if isinstance(node, ast.Assign)
        and isinstance(node.value, ast.Call)
        and last_name(node.value.func) in {"TypeVar", "ParamSpec"}
        for target in node.targets
        if isinstance(target, ast.Name)
    }
    scope = function
    while scope is not None:
        names.update(p.name for p in getattr(scope, "type_params", []))
        scope = context.parents.get(id(scope))
    return names


def is_generic_annotation(annotation, variables):
    members = set(members_of(annotation)) - {"None"}
    return bool(members) and members <= variables


def parameter_names(function, parent):
    names = [argument.arg for argument in parameters_of(function)]
    is_method = isinstance(parent, ast.ClassDef) and not any(
        last_name(decorator) in STATIC for decorator in function.decorator_list
    )
    return names[1:] if is_method else names


def class_parameters(node):
    init = next(
        (
            item
            for item in node.body
            if isinstance(item, FUNCTION_TYPES) and item.name == "__init__"
        ),
        None,
    )
    if init is not None:
        return parameter_names(init, node)
    return [
        item.target.id
        for item in node.body
        if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name)
    ]


def callable_targets(project):
    found = {}
    for context in project.contexts.values():
        for node in ast.walk(context.tree):
            if isinstance(node, FUNCTION_TYPES):
                parent = context.parents.get(id(node))
                entry = (id(node), parameter_names(node, parent), False)
                found.setdefault(node.name, []).append(entry)
            elif isinstance(node, ast.ClassDef):
                init = next(
                    (
                        item
                        for item in node.body
                        if isinstance(item, FUNCTION_TYPES) and item.name == "__init__"
                    ),
                    None,
                )
                target = id(init) if init is not None else id(node)
                found.setdefault(node.name, []).append(
                    (target, class_parameters(node), True)
                )
    return found


def is_own_attribute(target):
    return isinstance(target, ast.Attribute) and not (
        isinstance(target.value, ast.Name) and target.value.id in {"self", "cls"}
    )


def passed_names(node):
    named = [
        (kw.arg, kw.value) for kw in node.keywords if kw.arg is not None
    ]
    for kw in node.keywords:
        if kw.arg is None and isinstance(kw.value, ast.Dict):
            named += [
                (key.value, value)
                for key, value in zip(kw.value.keys, kw.value.values)
                if isinstance(key, ast.Constant) and isinstance(key.value, str)
            ]
    return named


def record_call(node, targets, params, fields):
    for target, parameters, is_class in targets.get(last_name(node.func), []):
        passed = [
            (parameters[index], value)
            for index, value in enumerate(node.args)
            if index < len(parameters)
        ] + [(name, value) for name, value in passed_names(node) if name in parameters]
        for name, value in passed:
            if is_falsy_literal(value):
                params.add((target, name))
                if is_class:
                    fields.add(name)


def falsy_sites(project):
    def build(_):
        targets = callable_targets(project)
        params, fields = set(), set()
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if isinstance(node, ast.Call):
                    record_call(node, targets, params, fields)
                elif isinstance(node, ast.Assign) and is_falsy_literal(node.value):
                    fields.update(t.attr for t in node.targets if is_own_attribute(t))
        return params, fields

    return project.memo("falsy-sites", build)


def is_set_to_falsy(project, function, key):
    params, fields = falsy_sites(project)
    if "." in key:
        return key.rsplit(".", 1)[-1] in fields
    return (id(function), key) in params
