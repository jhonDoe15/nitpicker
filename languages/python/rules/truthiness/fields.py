import ast

from signatures.annotations import NONE_MEMBER, decorator_names, members_of

NUMBER_TYPES = {"int", "float", "complex", "Decimal", "Fraction"}
NO_RECEIVER = {"staticmethod"}


def is_number(annotation):
    return bool(set(members_of(annotation)) & NUMBER_TYPES)


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


def field_owners(function, context, parameters, is_kind=is_number):
    fields = context.project.memo(
        f"{is_kind.__name__}-fields:{context.path}",
        lambda _project: number_fields(context.tree, is_kind),
    )
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
