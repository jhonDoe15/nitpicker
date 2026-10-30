import ast

from checks.common import last_name

NEUTRAL_BASES = {
    "object",
    "Protocol",
    "Generic",
    "ABC",
    "Enum",
    "StrEnum",
    "IntEnum",
    "Flag",
    "IntFlag",
    "NamedTuple",
}
DATA_MODEL_BASES = {
    "BaseModel",
    "BaseSettings",
    "SQLModel",
    "Model",
    "DeclarativeBase",
    "DeclarativeBaseNoMeta",
    "Base",
    "Document",
    "Schema",
    "TypedDict",
}
MAX_HIERARCHY_DEPTH = 12


def module_classes(context):
    return context.project.memo(
        ("module-classes", context.path),
        lambda _project: {
            node.name: node
            for node in ast.walk(context.tree)
            if isinstance(node, ast.ClassDef)
        },
    )


def base_names(node):
    return [last_name(base) for base in node.bases if last_name(base)]


def hierarchy(node, context):
    classes = module_classes(context)
    seen, pending, unresolved = [], [(node, 0)], False
    while pending:
        current, depth = pending.pop()
        if current in seen or depth > MAX_HIERARCHY_DEPTH:
            continue
        seen.append(current)
        for name in base_names(current):
            if name in classes:
                pending.append((classes[name], depth + 1))
            elif name not in NEUTRAL_BASES:
                unresolved = True
    return seen, unresolved


def is_data_mapped(node, context):
    members, _ = hierarchy(node, context)
    return any(
        name in DATA_MODEL_BASES for member in members for name in base_names(member)
    )


def inherited_names(node, context):
    members, unresolved = hierarchy(node, context)
    names = {
        statement.name
        for member in members[1:]
        for statement in member.body
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    return names, unresolved
