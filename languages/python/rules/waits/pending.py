import ast

from checks.common import is_log_call

INERT_CALLS = {"len", "bool", "str", "repr", "print", "id", "type", "isinstance"}
INERT_PARENTS = (
    ast.Compare,
    ast.BoolOp,
    ast.UnaryOp,
    ast.JoinedStr,
    ast.FormattedValue,
)
TEST_PARENTS = (ast.If, ast.While, ast.IfExp, ast.Assert)
OWNING_METHODS = {
    "cancel",
    "add_done_callback",
    "close",
    "aclose",
    "stop",
    "kill",
    "terminate",
    "abort",
    "destroy",
    "shutdown",
    "pop",
    "popitem",
    "copy",
}
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.GeneratorExp, ast.DictComp)


def loads_of(names, nodes):
    return [
        node
        for root in nodes
        for node in ast.walk(root)
        if isinstance(node, ast.Name)
        and node.id in names
        and isinstance(node.ctx, ast.Load)
    ]


def target_names(target):
    return {node.id for node in ast.walk(target) if isinstance(node, ast.Name)}


def is_inert_call(call, context):
    function = call.func
    if isinstance(function, ast.Name) and function.id in INERT_CALLS:
        return True
    return is_log_call(call, context.aliases)


def loop_owns(target, body, context):
    names = target_names(target)
    return any(hands_off(ref, context) for ref in loads_of(names, body))


def iterated_owns(parent, ref, context):
    if isinstance(parent, (ast.For, ast.AsyncFor)):
        return loop_owns(parent.target, parent.body, context)
    owner = context.parents.get(id(parent))
    if isinstance(owner, ast.DictComp):
        return loop_owns(parent.target, [owner.key, owner.value], context)
    return loop_owns(parent.target, [owner.elt], context)


def is_iterated(parent, ref):
    return (
        isinstance(parent, (ast.For, ast.AsyncFor, ast.comprehension))
        and parent.iter is ref
    )


def hands_off(ref, context):
    parent = context.parents.get(id(ref))
    if isinstance(parent, ast.Starred):
        ref = parent
        parent = context.parents.get(id(parent))
    if isinstance(parent, ast.Call):
        return not is_inert_call(parent, context)
    if is_iterated(parent, ref):
        return iterated_owns(parent, ref, context)
    if isinstance(parent, ast.Attribute):
        return parent.attr in OWNING_METHODS
    if isinstance(parent, INERT_PARENTS):
        return False
    return not (
        isinstance(parent, TEST_PARENTS) and getattr(parent, "test", None) is ref
    )


def is_owned(name, function, context, ignore=()):
    refs = [ref for ref in loads_of({name}, [function]) if ref not in ignore]
    return any(hands_off(ref, context) for ref in refs)
