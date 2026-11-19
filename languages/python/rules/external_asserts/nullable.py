import ast

from orm.models import class_assignments, constant, is_django_model, keyword

INSTANCE_TERMINALS = {
    "get",
    "first",
    "last",
    "latest",
    "earliest",
    "one",
    "one_or_none",
    "scalar_one_or_none",
}


def is_nullable_django(value):
    if not isinstance(value, ast.Call):
        return False
    return constant(keyword(value, "null")) is True


def is_nullable_mapped(annotation):
    text = ast.unparse(annotation)
    return text.startswith("Mapped[") and ("None" in text or "Optional" in text)


def nullable_fields(cls, context):
    names = set()
    if is_django_model(cls, context):
        for name, value in class_assignments(cls):
            if is_nullable_django(value):
                names.add(name)
        return names
    for statement in cls.body:
        if (
            isinstance(statement, ast.AnnAssign)
            and isinstance(statement.target, ast.Name)
            and is_nullable_mapped(statement.annotation)
        ):
            names.add(statement.target.id)
    return names


def build_index(project):
    found = {}
    for context in project.contexts.values():
        for node in ast.walk(context.tree):
            if isinstance(node, ast.ClassDef):
                names = nullable_fields(node, context)
                if node.name in found:
                    names = names & found[node.name]
                found[node.name] = names
    return {name: fields for name, fields in found.items() if fields}


def nullable_index(project):
    return project.memo("nullable-model-fields", build_index)


def chain_root(node):
    while True:
        if isinstance(node, ast.Await):
            node = node.value
        elif isinstance(node, ast.Call):
            node = node.func
        elif isinstance(node, (ast.Attribute, ast.Subscript)):
            node = node.value
        else:
            return node.id if isinstance(node, ast.Name) else None


def instance_model(value, index):
    if isinstance(value, ast.Await):
        value = value.value
    if not isinstance(value, ast.Call) or not isinstance(value.func, ast.Attribute):
        return None
    if value.func.attr not in INSTANCE_TERMINALS:
        return None
    root = chain_root(value)
    if root in index:
        return root
    first = value.args[0] if value.args else None
    if isinstance(first, ast.Name) and first.id in index and value.func.attr == "get":
        return first.id
    return None


def annotated_model(function, name, index):
    arguments = function.args
    for argument in arguments.posonlyargs + arguments.args + arguments.kwonlyargs:
        if argument.arg == name and argument.annotation is not None:
            text = ast.unparse(argument.annotation).strip("'\"")
            return text if text in index else None
    return None
