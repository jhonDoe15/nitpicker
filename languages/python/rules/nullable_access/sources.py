import ast

from django_models.graph import project_graph
from django_models.origin import model_of_class, queryset_model, terminal_call
from http_values.request_names import is_request_attribute
from security.resolve.scopes import Where, bindings, enclosing_class

FIRST = {"first", "last"}
INSTANCE_CALLS = {"get", "first", "last", "earliest", "latest"}
MAPPING_NAMES = {"cleaned_data", "validated_data", "attrs", "kwargs", "query_params"}
MAPPING_ATTRIBUTES = {"cleaned_data", "GET", "POST", "query_params", "session", "META"}


def is_mapping(node, function, context):
    if isinstance(node, ast.Name):
        found = single_binding(node.id, function, context)
        if found is not None and found[0] == "value" and found[1] is not None:
            return is_mapping(found[1], function, context)
        return node.id in MAPPING_NAMES
    if isinstance(node, ast.Attribute):
        if node.attr in MAPPING_ATTRIBUTES:
            return True
        return is_request_attribute(node, {"data"})
    return False


def optional_call(node, function, context):
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
        return None
    if node.func.attr == "get" and len(node.args) == 1 and not node.keywords:
        return (
            ".get() without a default"
            if is_mapping(node.func.value, function, context)
            else None
        )
    found = terminal_call(node, context)
    if found is not None and found[1] in FIRST and not node.args:
        return f".{found[1]}()"
    return None


def optional_label(node, function, context):
    if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or):
        return optional_label(node.values[-1], function, context)
    if isinstance(node, ast.IfExp):
        return optional_label(node.body, function, context) or optional_label(
            node.orelse, function, context
        )
    return optional_call(node, function, context)


def single_binding(name, function, context):
    found = bindings(Where(context, function)).get(name, [])
    return found[0] if len(found) == 1 else None


def is_method_of_model(function, context):
    owner = context.parents.get(id(function))
    if not isinstance(owner, ast.ClassDef) or not function.args.args:
        return None
    first = function.args.args[0].arg
    decorated = {ast.unparse(item) for item in function.decorator_list}
    if first != "self" or decorated & {"staticmethod", "classmethod"}:
        return None
    return project_graph(context.project).by_key.get((context.path, owner.name))


def annotated_model(annotation, context):
    if isinstance(annotation, (ast.Name, ast.Attribute)):
        return model_of_class(annotation, context)
    return None


def chain_calls(node):
    while isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        yield node
        node = node.func.value


def is_constant(node, value):
    return isinstance(node, ast.Constant) and node.value is value


def proves_not_null(item, rest, exclude):
    if exclude:
        return (rest == "" and is_constant(item.value, None)) or (
            rest == "isnull" and is_constant(item.value, True)
        )
    if rest == "isnull":
        return is_constant(item.value, False)
    return not (rest == "" and is_constant(item.value, None))


def proven_fields(source, model):
    names = set()
    for call in chain_calls(source):
        exclude = call.func.attr == "exclude"
        for item in call.keywords:
            field, _, rest = (item.arg or "").partition("__")
            if field in model.fields and proves_not_null(item, rest, exclude):
                names.add(field)
    return names


def instance_of(name, function, context):
    found = single_binding(name, function, context)
    if found is None:
        return None, set()
    kind, value = found
    if kind == "param":
        return annotated_model(value, context), set()
    if value is None:
        return None, set()
    if kind == "iter":
        model = queryset_model(value, context)
        return model, proven_fields(value, model) if model else set()
    called = terminal_call(value, context)
    if called is not None and called[1] in INSTANCE_CALLS:
        return called[0], proven_fields(value, called[0])
    return None, set()
