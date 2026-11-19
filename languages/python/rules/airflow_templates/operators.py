import ast

from checks.common import dotted_name
from security.resolve.scopes import MAX_HOPS, definition, module_where

OPERATOR_ROOTS = ("airflow.",)
OPERATOR_ENDINGS = ("Operator", "Sensor")
TEMPLATE_FIELDS = "template_fields"


def is_airflow_base(name):
    if not name or not name.startswith(OPERATOR_ROOTS):
        return False
    return name.rsplit(".", 1)[-1].endswith(OPERATOR_ENDINGS)


def is_operator(cls, context, hops=0):
    if hops > MAX_HOPS:
        return False
    for base in cls.bases:
        if is_airflow_base(dotted_name(base, context.aliases)):
            return True
        found = definition(base, module_where(context))
        if found is not None and found[0] is not cls:
            if is_operator(found[0], found[1].context, hops + 1):
                return True
    return False


def field_value(statement):
    if isinstance(statement, ast.Assign):
        names = [t.id for t in statement.targets if isinstance(t, ast.Name)]
        return statement.value if TEMPLATE_FIELDS in names else None
    if isinstance(statement, ast.AnnAssign):
        target = statement.target
        is_field = isinstance(target, ast.Name) and target.id == TEMPLATE_FIELDS
        return statement.value if is_field else None
    return None


def module_constant(name, context):
    for statement in context.tree.body:
        if isinstance(statement, ast.Assign):
            if any(isinstance(t, ast.Name) and t.id == name for t in statement.targets):
                return statement.value
        elif isinstance(statement, ast.AnnAssign) and statement.value is not None:
            target = statement.target
            if isinstance(target, ast.Name) and target.id == name:
                return statement.value
    return None


def inherited_fields(node, context, hops):
    if isinstance(node, ast.Attribute) and node.attr == TEMPLATE_FIELDS:
        found = definition(node.value, module_where(context))
        if found is not None:
            return template_fields(found[0], found[1].context, hops + 1)
    return set()


def value_fields(node, context, hops):
    if hops > MAX_HOPS:
        return set()
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return {node.value}
    if isinstance(node, (ast.Tuple, ast.List, ast.Set)):
        return set().union(*(value_fields(item, context, hops) for item in node.elts))
    if isinstance(node, ast.Starred):
        return value_fields(node.value, context, hops)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return value_fields(node.left, context, hops) | value_fields(
            node.right, context, hops
        )
    if isinstance(node, ast.Name):
        constant = module_constant(node.id, context)
        if constant is None:
            return set()
        return value_fields(constant, context, hops + 1)
    return inherited_fields(node, context, hops)


def template_field_names(cls, context, hops=0):
    for statement in cls.body:
        value = field_value(statement)
        if value is not None:
            return value_fields(value, context, hops)
    return set()


def template_fields(cls, context, hops=0):
    fields = template_field_names(cls, context, hops)
    if hops > MAX_HOPS:
        return fields
    for base in cls.bases:
        found = definition(base, module_where(context))
        if found is not None and found[0] is not cls:
            fields |= template_fields(found[0], found[1].context, hops + 1)
    return fields


def init_of(cls):
    for statement in cls.body:
        is_init = isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef))
        if is_init and statement.name == "__init__":
            return statement
    return None
