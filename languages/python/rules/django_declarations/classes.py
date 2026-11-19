import ast

from checks.common import dotted_name
from django_models.meta import meta_class
from django_models.origin import model_of_class, queryset_model
from orm.models import class_assignments
from security.resolve.scopes import MAX_HOPS, definition, where_of

ADMIN_REGISTER = "register"


def assignment(cls, name):
    return next((value for key, value in class_assignments(cls) if key == name), None)


def meta_assignment(cls, name):
    meta = meta_class(cls)
    return assignment(meta, name) if meta is not None else None


def named_model(node, context):
    if isinstance(node, (ast.Name, ast.Attribute)):
        return model_of_class(node, context)
    return None


def meta_model(cls, context):
    return named_model(meta_assignment(cls, "model"), context)


def ancestors(cls, context, hops=0):
    found = [(cls, context)]
    if hops > MAX_HOPS:
        return found
    for base in cls.bases:
        resolved = definition(base, where_of(base, context))
        if resolved is not None and resolved[0] is not cls:
            found.extend(ancestors(resolved[0], resolved[1].context, hops + 1))
    return found


def base_paths(cls, context):
    return [
        dotted_name(base, owner_context.aliases) or ""
        for owner, owner_context in ancestors(cls, context)
        for base in owner.bases
    ]


def derives_from(cls, context, prefix, suffix=""):
    return any(
        path.startswith(prefix) and path.endswith(suffix)
        for path in base_paths(cls, context)
    )


def serializer_model(cls, context):
    value = assignment(cls, "serializer_class")
    if not isinstance(value, (ast.Name, ast.Attribute)):
        return None
    found = definition(value, where_of(value, context))
    return meta_model(found[0], found[1].context) if found else None


def view_model(cls, context):
    queryset = assignment(cls, "queryset")
    if queryset is not None:
        return queryset_model(queryset, context)
    return serializer_model(cls, context)


def registered_models(call, decorator):
    if not (call.args and isinstance(call.func, ast.Attribute)):
        return []
    if call.func.attr != ADMIN_REGISTER:
        return []
    if decorator:
        return list(call.args)
    first = call.args[0]
    return list(first.elts) if isinstance(first, (ast.List, ast.Tuple)) else [first]


def registered_names(cls, context):
    names = []
    for decorator in cls.decorator_list:
        if isinstance(decorator, ast.Call):
            names.extend(registered_models(decorator, True))
    for statement in context.tree.body:
        call = statement.value if isinstance(statement, ast.Expr) else None
        if isinstance(call, ast.Call) and len(call.args) >= 2:
            second = call.args[1]
            if isinstance(second, ast.Name) and second.id == cls.name:
                names.extend(registered_models(call, False))
    return names


def admin_model(cls, context):
    names = registered_names(cls, context)
    return named_model(names[0], context) if len(names) == 1 else None
