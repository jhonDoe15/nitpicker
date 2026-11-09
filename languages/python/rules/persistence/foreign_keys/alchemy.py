import ast

from checks.common import dotted_name, string_value
from persistence.foreign_keys.keys import Column, Model, with_bases

ROOTS = ("sqlalchemy.", "flask_sqlalchemy.", "sqlmodel.")
DB_RECEIVER = "db"
COLUMNS = {"Column", "mapped_column"}
FIELD = "Field"
TABLE = "Table"
INDEX, UNIQUE, PRIMARY, FOREIGN = (
    "Index",
    "UniqueConstraint",
    "PrimaryKeyConstraint",
    "ForeignKeyConstraint",
)
PARTIAL_SUFFIX = "_where"
TABLE_ARGS = "__table_args__"
ORDERS = {"asc", "desc", "nulls_first", "nulls_last"}
COLUMN_KWARGS = "sa_column_kwargs"


def kind(node, context):
    if not isinstance(node, ast.Call):
        return None
    name = dotted_name(node.func, context.aliases) or ""
    receiver = node.func.value if isinstance(node.func, ast.Attribute) else None
    on_db = isinstance(receiver, ast.Name) and receiver.id == DB_RECEIVER
    return name.rsplit(".", 1)[-1] if name.startswith(ROOTS) or on_db else None


def keyword_true(call, name):
    value = next((item.value for item in call.keywords if item.arg == name), None)
    return isinstance(value, ast.Constant) and value.value is True


def keyword_value(call, name):
    return next((item.value for item in call.keywords if item.arg == name), None)


def column_name(node):
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in ORDERS:
        node = node.func.value
    if isinstance(node, ast.Name):
        return node.id
    text = string_value(node)
    if text is not None:
        return text
    return node.attr if isinstance(node, ast.Attribute) else None


def dict_true(node, name):
    if not isinstance(node, ast.Dict):
        return False
    return any(
        string_value(key) == name and isinstance(value, ast.Constant) and value.value is True
        for key, value in zip(node.keys, node.values)
    )


def is_indexed(call):
    extra = keyword_value(call, COLUMN_KWARGS)
    names = ("index", "unique")
    return any(keyword_true(call, name) or dict_true(extra, name) for name in names)


def column_of(call, attribute, context):
    if not isinstance(call, ast.Call):
        return None
    called = kind(call, context)
    inner = keyword_value(call, "sa_column")
    if called == FIELD and kind(inner, context) in COLUMNS:
        call, called = inner, kind(inner, context)
    if called == FIELD:
        foreign = string_value(keyword_value(call, "foreign_key")) is not None
    elif called in COLUMNS:
        foreign = any(kind(argument, context) == "ForeignKey" for argument in call.args)
    else:
        return None
    named = string_value(call.args[0]) if call.args else None
    flags = {"foreign"} if foreign else set()
    flags |= {"indexed"} if is_indexed(call) else set()
    flags |= {"primary"} if keyword_true(call, "primary_key") else set()
    names = {name for name in (attribute, named) if name}
    return Column(attribute or named, names, call, flags)


def constraint(model, call, context):
    if not isinstance(call, ast.Call):
        return
    called = kind(call, context)
    partial = any((item.arg or "").endswith(PARTIAL_SUFFIX) for item in call.keywords)
    if called == INDEX and not partial:
        model.add_index([column_name(argument) for argument in call.args[1:]])
    elif called in (UNIQUE, PRIMARY):
        model.add_index([column_name(argument) for argument in call.args])
    elif called == FOREIGN and call.args and isinstance(call.args[0], (ast.List, ast.Tuple)):
        model.keys.append((call, [column_name(item) for item in call.args[0].elts]))


def args_entries(value):
    pending, entries = [value], []
    for node in pending:
        if isinstance(node, ast.BinOp):
            pending.extend([node.left, node.right])
        elif isinstance(node, (ast.Tuple, ast.List)):
            entries.extend(node.elts)
        elif isinstance(node, ast.FunctionDef):
            pending.extend(item.value for item in ast.walk(node) if isinstance(item, ast.Return) and item.value)
        else:
            entries.append(node)
    return entries


def table_args(model, value, context):
    for entry in args_entries(value):
        if isinstance(entry, ast.Call):
            constraint(model, entry, context)


def assigned(item):
    if isinstance(item, ast.Assign) and len(item.targets) == 1:
        target = item.targets[0]
    elif isinstance(item, ast.AnnAssign):
        target = item.target
    else:
        return None, None
    return (target.id if isinstance(target, ast.Name) else None), item.value


def class_model(node, context):
    model = Model(node.name)
    model.bases = [base.id for base in node.bases if isinstance(base, ast.Name)]
    for item in node.body:
        name, value = assigned(item)
        if isinstance(item, ast.FunctionDef) and item.name == TABLE_ARGS:
            name, value = TABLE_ARGS, item
        if isinstance(item, ast.Expr) and kind(item.value, context) == INDEX:
            constraint(model, item.value, context)
            continue
        if name == TABLE_ARGS:
            table_args(model, value, context)
            continue
        column = column_of(value, name, context) if isinstance(value, ast.Call) else None
        if column is not None:
            model.columns.append(column)
    return model


def table_model(call, context):
    parent = context.parents.get(id(call))
    variable, _ = assigned(parent) if parent is not None else (None, None)
    model = Model(string_value(call.args[0]) if call.args else TABLE, [variable] if variable else [])
    for argument in call.args[2:]:
        column = column_of(argument, None, context)
        if column is not None:
            model.columns.append(column)
        else:
            constraint(model, argument, context)
    return model


def index_owner(argument):
    node = argument
    while isinstance(node, ast.Attribute):
        node = node.value
    return node.id if isinstance(node, ast.Name) else None


def module_indexes(context, models):
    by_name = {alias: model for model in models for alias in model.aliases}
    for node in ast.walk(context.tree):
        if kind(node, context) != INDEX or not node.args[1:]:
            continue
        parent = context.parents.get(id(node))
        nested = isinstance(parent, (ast.Tuple, ast.List, ast.Call))
        if nested or isinstance(context.parents.get(id(parent)), ast.ClassDef):
            continue
        owner = by_name.get(index_owner(node.args[1]))
        if owner is not None:
            constraint(owner, node, context)


def alchemy_models(context):
    models = []
    for node in ast.walk(context.tree):
        if isinstance(node, ast.ClassDef):
            models.append(class_model(node, context))
        elif kind(node, context) == TABLE:
            models.append(table_model(node, context))
    module_indexes(context, models)
    return with_bases(models)
