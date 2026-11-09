import ast

from checks.common import dotted_name

COLUMN_CALLS = {
    "Column",
    "mapped_column",
    "column_property",
    "relationship",
    "Relationship",
    "ForeignKey",
    "OneToOneField",
    "ManyToManyField",
}
KEY_CALLS = {"ForeignKey", "OneToOneField"}
FIELD_SUFFIX = "Field"
MAPPED = "Mapped"
TABLE_KEYWORD = "table"
IMPLICIT_COLUMNS = {"id", "pk"}
BASE_DEPTH = 4


def called_name(value):
    if not isinstance(value, ast.Call):
        return ""
    func = value.func
    if isinstance(func, ast.Attribute):
        return func.attr
    return func.id if isinstance(func, ast.Name) else ""


def is_column_value(value):
    name = called_name(value)
    return name in COLUMN_CALLS or name.endswith(FIELD_SUFFIX)


def annotation_head(node):
    if isinstance(node, ast.Subscript):
        node = node.value
    if isinstance(node, ast.Attribute):
        return node.attr
    return node.id if isinstance(node, ast.Name) else None


def is_table_class(cls):
    return any(
        keyword.arg == TABLE_KEYWORD
        and isinstance(keyword.value, ast.Constant)
        and keyword.value.value is True
        for keyword in cls.keywords
    )


def assigned_columns(item):
    names = [target.id for target in item.targets if isinstance(target, ast.Name)]
    if not is_column_value(item.value):
        return set()
    keys = {f"{name}_id" for name in names} if called_name(item.value) in KEY_CALLS else set()
    return set(names) | keys


def annotated_column(item, table):
    if not isinstance(item.target, ast.Name):
        return set()
    declared = item.value is not None and is_column_value(item.value)
    if table or declared or annotation_head(item.annotation) == MAPPED:
        return {item.target.id}
    return set()


def own_columns(cls):
    columns, computed = set(), set()
    table = is_table_class(cls)
    for item in cls.body:
        if isinstance(item, ast.Assign):
            columns |= assigned_columns(item)
        elif isinstance(item, ast.AnnAssign):
            columns |= annotated_column(item, table)
        elif isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
            computed.add(item.name)
    return columns, computed


def class_in(tree, name):
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == name:
            return node
    return None


def located_class(context, name):
    dotted = dotted_name(ast.Name(id=name), context.aliases)
    if dotted == name:
        return class_in(context.tree, name), context
    place = context.project.locate(dotted)
    owner = context.project.contexts.get(place[0]) if place else None
    if owner is None:
        return None, None
    return class_in(owner.tree, place[1]), owner


def declared_columns(context, name, depth):
    cls, owner = located_class(context, name)
    if cls is None or depth > BASE_DEPTH:
        return set(), set()
    columns, computed = own_columns(cls)
    for base in cls.bases:
        if isinstance(base, ast.Name):
            inherited, hidden = declared_columns(owner, base.id, depth + 1)
            columns |= inherited
            computed |= hidden
    return columns, computed


def model_columns(context, name):
    def build(_):
        columns, computed = declared_columns(context, name, 0)
        if not columns:
            return frozenset()
        return frozenset((columns | IMPLICIT_COLUMNS) - computed)

    return context.project.memo(("orm-model-columns", context.path, name), build)
