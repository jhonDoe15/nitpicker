import ast

from checks.common import last_name
from persistence.memory.check import is_known
from persistence.updates.hooks import class_chain

RELATIONS = {
    "ForeignKey",
    "OneToOneField",
    "ManyToManyField",
    "relationship",
    "Relationship",
}


def relation_names(context, model):
    names = set()
    for cls in class_chain(context, model):
        for item in cls.body:
            value = getattr(item, "value", None)
            if not (isinstance(value, ast.Call) and last_name(value.func) in RELATIONS):
                continue
            targets = (
                item.targets
                if isinstance(item, ast.Assign)
                else [getattr(item, "target", None)]
            )
            names |= {target.id for target in targets if isinstance(target, ast.Name)}
    return names


def is_scalar_column(context, model, field):
    return is_known(context, model, {field}) and field not in relation_names(
        context, model
    )
