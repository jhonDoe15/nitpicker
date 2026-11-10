import ast
import re

DIRECTIONS = (
    ("to", "from"),
    ("dumps", "loads"),
    ("dump", "load"),
    ("encode", "decode"),
    ("serialize", "deserialize"),
    ("serialise", "deserialise"),
    ("marshal", "unmarshal"),
    ("parse", "format"),
    ("pack", "unpack"),
    ("encrypt", "decrypt"),
    ("compress", "decompress"),
    ("escape", "unescape"),
)
NEEDS_REST = {"to"}
IMPLICIT = {("to", ("string",))}
WORD = re.compile(r"[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+")
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
SKIPPED_DECORATORS = {"overload", "abstractmethod", "property", "cached_property"}
PROTOCOL_BASES = {"Protocol", "ABC"}
BLOCKS = (ast.If, ast.Try, getattr(ast, "TryStar", ast.Try), ast.With)


def words_of(name):
    return [word.lower() for part in name.split("_") for word in WORD.findall(part)]


def direction_of(name):
    words = words_of(name)
    if not words:
        return None
    for index, verbs in enumerate(DIRECTIONS):
        if words[0] in verbs:
            rest = tuple(words[1:])
            if (verbs[0] in NEEDS_REST and not rest) or (verbs[0], rest) in IMPLICIT:
                return None
            return index, verbs.index(words[0]), rest
    return None


def decorator_names(node):
    for item in node.decorator_list:
        target = item.func if isinstance(item, ast.Call) else item
        if isinstance(target, ast.Name):
            yield target.id
        elif isinstance(target, ast.Attribute):
            yield target.attr


def is_stub(node):
    body = [
        item
        for item in node.body
        if not (isinstance(item, ast.Expr) and isinstance(item.value, ast.Constant))
    ]
    if not body:
        return True
    if len(body) != 1:
        return False
    only = body[0]
    if isinstance(only, ast.Pass):
        return True
    raised = only.exc if isinstance(only, ast.Raise) else None
    target = raised.func if isinstance(raised, ast.Call) else raised
    return isinstance(target, ast.Name) and target.id == "NotImplementedError"


def is_candidate(node):
    if not isinstance(node, FUNCTIONS) or node.name.startswith("_"):
        return False
    if any(name in SKIPPED_DECORATORS for name in decorator_names(node)):
        return False
    return not is_stub(node)


def base_names(node):
    for base in node.bases:
        if isinstance(base, ast.Name):
            yield base.id
        elif isinstance(base, ast.Attribute):
            yield base.attr
        elif isinstance(base, ast.Subscript) and isinstance(base.value, ast.Name):
            yield base.value.id


def statements(body):
    pending = list(body)
    for node in pending:
        if isinstance(node, BLOCKS):
            for field in ("body", "orelse", "finalbody"):
                pending.extend(getattr(node, field, []))
            for handler in getattr(node, "handlers", []):
                pending.extend(handler.body)
        else:
            yield node


def classes(body):
    pending = [("", node) for node in statements(body)]
    for owner, node in pending:
        if not isinstance(node, ast.ClassDef) or node.name.startswith("_"):
            continue
        if any(name in PROTOCOL_BASES for name in base_names(node)):
            continue
        name = f"{owner}{node.name}"
        members = list(statements(node.body))
        pending.extend((f"{name}.", item) for item in members)
        yield name, [item for item in members if is_candidate(item)]


def groups(tree):
    yield None, [node for node in statements(tree.body) if is_candidate(node)]
    yield from classes(tree.body)


def pairs_in(members):
    sides = {}
    for node in members:
        found = direction_of(node.name)
        if found is not None:
            index, side, rest = found
            pair = sides.setdefault((index, rest), [None, None])
            pair[side] = pair[side] or node
    for first, second in sides.values():
        if first is not None and second is not None:
            yield first, second


def round_trip_pairs(tree):
    for owner, members in groups(tree):
        for first, second in pairs_in(members):
            yield owner, first, second
