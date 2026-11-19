import ast

from signatures.annotations import NONE_MEMBER, decorator_names, members_of

NUMBER_TYPES = {"int", "float", "complex", "Decimal", "Fraction"}
ZERO_VALUED_TYPES = NUMBER_TYPES | {"timedelta", "QuerySet"}
NO_RECEIVER = {"staticmethod"}


def is_number(annotation):
    return bool(set(members_of(annotation)) & ZERO_VALUED_TYPES)


def is_numeric(annotation):
    members = set(members_of(annotation))
    return bool(members) and members <= NUMBER_TYPES


def class_number_fields(node, is_kind=is_number):
    return {
        item.target.id
        for item in node.body
        if isinstance(item, ast.AnnAssign)
        and isinstance(item.target, ast.Name)
        and is_kind(item.annotation)
    }


def number_fields(tree, is_kind=is_number):
    fields = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            fields.setdefault(node.name, set()).update(
                class_number_fields(node, is_kind)
            )
    return {name: found for name, found in fields.items() if found}


def annotated_class(annotation, fields):
    members = set(members_of(annotation)) - {NONE_MEMBER}
    return (
        next(iter(members)) if len(members) == 1 and members <= fields.keys() else None
    )


def receiver_owner(function, context, fields):
    parent = context.parents.get(id(function))
    positional = [*function.args.posonlyargs, *function.args.args]
    if (
        not isinstance(parent, ast.ClassDef)
        or parent.name not in fields
        or not positional
    ):
        return {}
    if decorator_names(function) & NO_RECEIVER:
        return {}
    return {positional[0].arg: parent.name}


def imported_number_fields(context):
    def build(project):
        found = {}
        for local, dotted in context.aliases[0].items():
            module, _, name = dotted.rpartition(".")
            path = project.module_path(module) if module else None
            other = project.contexts.get(path) if path else None
            if other is None or other is context:
                continue
            classes = [
                node
                for node in other.tree.body
                if isinstance(node, ast.ClassDef) and node.name == name
            ]
            fields = class_number_fields(classes[0]) if len(classes) == 1 else set()
            if fields:
                found[local] = fields
        return found

    return context.project.memo(("imported-number-fields", context.path), build)


def field_owners(function, context, parameters, is_kind=is_number):
    fields = context.project.memo(
        f"{is_kind.__name__}-fields:{context.path}",
        lambda _project: number_fields(context.tree, is_kind),
    )
    if is_kind is is_number:
        fields = {**imported_number_fields(context), **fields}
    owners = receiver_owner(function, context, fields)
    for argument in parameters:
        owner = annotated_class(argument.annotation, fields)
        if owner is not None:
            owners[argument.arg] = owner
    return {name: fields[owner] for name, owner in owners.items()}


def field_name(node, owners):
    if not (
        isinstance(node, ast.Attribute)
        and isinstance(node.ctx, ast.Load)
        and isinstance(node.value, ast.Name)
    ):
        return None
    found = owners.get(node.value.id, set())
    return f"{node.value.id}.{node.attr}" if node.attr in found else None
