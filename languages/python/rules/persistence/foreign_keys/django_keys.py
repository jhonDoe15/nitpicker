import ast

from checks.common import dotted_name, string_value
from persistence.foreign_keys.keys import Column, Model, with_bases

DJANGO_ROOT = "django."
FOREIGN_KEY = "ForeignKey"
META = "Meta"
LISTED = ("unique_together", "index_together")
BUILT = {"Index", "UniqueConstraint"}


def django_name(call, context):
    if not isinstance(call, ast.Call):
        return None
    name = dotted_name(call.func, context.aliases) or ""
    return name.rsplit(".", 1)[-1] if name.startswith(DJANGO_ROOT) else None


def keyword_value(call, name):
    return next((item.value for item in call.keywords if item.arg == name), None)


def is_constant(node, value):
    return isinstance(node, ast.Constant) and node.value is value


def names_of(node):
    items = node.elts if isinstance(node, (ast.List, ast.Tuple)) else []
    return [string_value(item) for item in items]


def built_index(model, call, context):
    if django_name(call, context) not in BUILT or keyword_value(call, "condition") is not None:
        return
    fields = keyword_value(call, "fields")
    model.add_index([name.lstrip("-") if name else name for name in names_of(fields)])


def assignment(item):
    if isinstance(item, ast.Assign) and isinstance(item.targets[0], ast.Name):
        return item.targets[0].id, item.value
    if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name) and item.value:
        return item.target.id, item.value
    return None, None


def meta_options(model, meta, context):
    for item in meta.body:
        option, value = assignment(item)
        if option is None:
            continue
        if option in LISTED:
            groups = value.elts if isinstance(value, (ast.List, ast.Tuple)) else []
            nested = all(isinstance(group, (ast.List, ast.Tuple)) for group in groups)
            for group in groups if nested else [value]:
                model.add_index(names_of(group))
        elif option in ("indexes", "constraints"):
            for call in value.elts if isinstance(value, (ast.List, ast.Tuple)) else []:
                built_index(model, call, context)


def field_column(name, call):
    unindexed = is_constant(keyword_value(call, "db_index"), False)
    constrained = not is_constant(keyword_value(call, "db_constraint"), False)
    primary = is_constant(keyword_value(call, "primary_key"), True)
    unique = is_constant(keyword_value(call, "unique"), True)
    flags = {"foreign"} if unindexed and constrained else set()
    flags |= {"primary"} if primary else set()
    flags |= {"indexed"} if unique else set()
    column = string_value(keyword_value(call, "db_column"))
    return Column(name, {name, f"{name}_id", *([column] if column else [])}, call, flags)


def class_model(node, context):
    model = Model(node.name)
    model.bases = [base.id for base in node.bases if isinstance(base, ast.Name)]
    for item in node.body:
        name, value = assignment(item)
        if isinstance(item, ast.ClassDef) and item.name == META:
            meta_options(model, item, context)
        elif name is not None and django_name(value, context) == FOREIGN_KEY:
            model.columns.append(field_column(name, value))
    return model


def django_models(context):
    return with_bases(
        [class_model(node, context) for node in ast.walk(context.tree) if isinstance(node, ast.ClassDef)]
    )
