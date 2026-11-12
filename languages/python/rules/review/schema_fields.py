import ast

from checks.common import dotted_name

SCHEMA = "schema"
SCHEMA_BASES = {"marshmallow.Schema"}
QUALIFIED_RECORD_BASES = {"msgspec.Struct"}
FIELDS_MODULE = "marshmallow.fields."
LIST_FIELD = "marshmallow.fields.List"
NESTED_FIELD = "marshmallow.fields.Nested"
FIELD_ALIASES = {
    f"{FIELDS_MODULE}Str": f"{FIELDS_MODULE}String",
    f"{FIELDS_MODULE}Int": f"{FIELDS_MODULE}Integer",
    f"{FIELDS_MODULE}Bool": f"{FIELDS_MODULE}Boolean",
}
OUTPUT_ONLY = "dump_only"


def keyword_value(call, name):
    found = next((keyword.value for keyword in call.keywords if keyword.arg == name), None)
    return isinstance(found, ast.Constant) and found.value is True


def bare(node, aliases):
    if not isinstance(node, ast.Call):
        return node
    name = dotted_name(node.func, aliases)
    name = FIELD_ALIASES.get(name, name)
    return ast.Call(
        func=ast.Name(id=name or ast.dump(node.func), ctx=ast.Load()),
        args=[bare(argument, aliases) for argument in node.args],
        keywords=[],
    )


def listed(element):
    return ast.Subscript(
        value=ast.Name(id="list", ctx=ast.Load()), slice=element, ctx=ast.Load()
    )


def field_shape(call, aliases):
    name = dotted_name(call.func, aliases)
    if name == LIST_FIELD and call.args:
        return listed(bare(call.args[0], aliases))
    if name == NESTED_FIELD and keyword_value(call, "many"):
        nested = ast.Call(func=call.func, args=call.args, keywords=[])
        return listed(bare(nested, aliases))
    return bare(call, aliases)


def schema_field(statement, aliases):
    if not (
        isinstance(statement, ast.Assign)
        and len(statement.targets) == 1
        and isinstance(statement.targets[0], ast.Name)
        and isinstance(statement.value, ast.Call)
    ):
        return None
    name = dotted_name(statement.value.func, aliases) or ""
    is_field = name.startswith(FIELDS_MODULE)
    output_only = keyword_value(statement.value, OUTPUT_ONLY)
    if not is_field or output_only or keyword_value(statement.value, "required"):
        return None
    return statement.targets[0].id, field_shape(statement.value, aliases)


def schema_inputs(node, aliases):
    fields = {}
    for statement in node.body:
        found = schema_field(statement, aliases)
        if found is not None:
            fields[found[0]] = found[1]
    return fields


def qualified_kind(context, node):
    qualified = {dotted_name(base, context.aliases) for base in node.bases}
    if qualified & SCHEMA_BASES:
        return SCHEMA
    return "record" if qualified & QUALIFIED_RECORD_BASES else None
