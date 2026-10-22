import ast

from checks.common import dotted_name
from design.lookup import entity_of
from design.symbols import Klass, LiteralAlias

WRAPPERS = {
    "Annotated",
    "Final",
    "ClassVar",
    "Required",
    "NotRequired",
    "ReadOnly",
    "InitVar",
}

BUILTIN_GENERICS = {
    "typing.List": "list",
    "typing.Dict": "dict",
    "typing.Set": "set",
    "typing.FrozenSet": "frozenset",
    "typing.Tuple": "tuple",
}


def base_name(node):
    if isinstance(node, ast.Attribute):
        return node.attr
    return node.id if isinstance(node, ast.Name) else None


def parse_string(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        try:
            return ast.parse(node.value.strip(), mode="eval").body
        except SyntaxError:
            return node
    return node


def union_members(node):
    members, pending = [], [node]
    for current in pending:
        if isinstance(current, ast.BinOp) and isinstance(current.op, ast.BitOr):
            pending.extend([current.left, current.right])
        else:
            members.append(current)
    return members


def is_none(node):
    return isinstance(node, ast.Constant) and node.value is None


def subscript_arguments(node):
    inner = node.slice
    return list(inner.elts) if isinstance(inner, ast.Tuple) else [inner]


def present_members(node):
    if isinstance(node, ast.Subscript) and base_name(node.value) == "Union":
        members = subscript_arguments(node)
    else:
        members = union_members(node)
    return [parse_string(m) for m in members if not is_none(parse_string(m))]


def unwrap(node):
    for _ in range(8):
        node = parse_string(node)
        name = base_name(node.value) if isinstance(node, ast.Subscript) else None
        if name in WRAPPERS or name == "Optional":
            node = subscript_arguments(node)[0]
        elif name == "Union" or isinstance(node, ast.BinOp):
            members = present_members(node)
            if len(members) != 1:
                return node
            node = members[0]
        else:
            return node
    return node


def project_type(index, module, node, owner=None):
    node = unwrap(node)
    if isinstance(node, ast.Name) and node.id == "Self" and owner is not None:
        return owner
    if isinstance(node, ast.Subscript) and base_name(node.value) in {"type", "Type"}:
        return None
    entity = entity_of(index, module, node)
    return entity if isinstance(entity, (Klass, LiteralAlias)) else None


def is_project_node(index, module, node):
    node = unwrap(node)
    if project_type(index, module, node) is not None:
        return True
    return any(
        is_project_node(index, module, child)
        for child in ast.iter_child_nodes(node)
        if isinstance(child, ast.expr)
    )


def type_text(index, module, node):
    node = parse_string(node)
    if is_none(node):
        return "None"
    if isinstance(node, (ast.Name, ast.Attribute)):
        return named_text(index, module, node)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        return "|".join(type_text(index, module, m) for m in union_members(node))
    if isinstance(node, ast.Subscript):
        return subscript_text(index, module, node)
    if isinstance(node, ast.List):
        return "[" + ",".join(type_text(index, module, e) for e in node.elts) + "]"
    if isinstance(node, ast.Constant):
        return "..." if node.value is Ellipsis else repr(node.value).replace(" ", "")
    return "expression"


def named_text(index, module, node):
    entity = entity_of(index, module, node)
    if isinstance(entity, (Klass, LiteralAlias)):
        return entity.name
    text = (dotted_name(node, module.aliases) or "expression").replace(" ", "")
    return BUILTIN_GENERICS.get(text, text)


def subscript_text(index, module, node):
    name = base_name(node.value)
    arguments = subscript_arguments(node)
    if name == "Optional":
        return f"{type_text(index, module, arguments[0])}|None"
    if name == "Union":
        return "|".join(type_text(index, module, a) for a in arguments)
    base = type_text(index, module, node.value)
    if name == "Literal" or any(is_project_node(index, module, a) for a in arguments):
        return base if name != "Literal" else f"{base}[{literal_text(arguments)}]"
    rendered = ",".join(type_text(index, module, a) for a in arguments)
    return f"{base}[{rendered}]"


def literal_text(arguments):
    return ",".join(repr(getattr(a, "value", "?")).replace(" ", "") for a in arguments)
