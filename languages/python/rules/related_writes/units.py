import ast
from collections import namedtuple

from checks.common import dotted_name, walk_statements, words_of
from effect_kinds.tables import WRITE
from kinds.names import chain_names
from kinds.sites import outer_calls
from transactions.scopes import DATABASE_WORDS, TRANSACTIONS, transaction_label

LOOPS = (ast.For, ast.AsyncFor, ast.While)
TRIES = (ast.Try, getattr(ast, "TryStar", ast.Try))
DJANGO_MANAGER = "objects"
Block = namedtuple("Block", "node label django owners expression")


def ancestors(node, parents, function):
    child = node
    parent = parents.get(id(child))
    while parent is not None and parent is not function:
        yield child, parent
        child, parent = parent, parents.get(id(parent))


def is_incidental(node, parents, function):
    for child, parent in ancestors(node, parents, function):
        if isinstance(parent, LOOPS) and child in parent.body:
            return True
        if isinstance(parent, ast.ExceptHandler):
            return True
        if isinstance(parent, TRIES) and child in parent.finalbody:
            return True
    return False


def direct_writes(function, scope):
    found = []
    for call in outer_calls(walk_statements(function.body)):
        effects = scope.effects(call)
        if WRITE in effects and len(effects[WRITE]) == 1:
            found.append(call)
    return found


def is_django_scope(expression, scope):
    call = expression.func if isinstance(expression, ast.Call) else expression
    return dotted_name(call, scope.aliases) in TRANSACTIONS


def base_text(node):
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if not isinstance(node, ast.Name):
        return None
    parts.append(node.id)
    return ".".join(reversed(parts))


def owner_names(node):
    names = {
        n.id
        for item in node.items
        if item.optional_vars is not None
        for n in ast.walk(item.optional_vars)
        if isinstance(n, ast.Name)
    }
    for item in node.items:
        expression = item.context_expr
        if isinstance(expression, ast.Call) and isinstance(expression.func, ast.Attribute):
            owner = base_text(expression.func.value)
            if owner and (words_of(owner.split(".")[-1]) or [""])[-1] != "engine":
                names.add(owner)
    return names


def transaction_blocks(function, scope):
    blocks = []
    for node in walk_statements(function.body):
        if not isinstance(node, (ast.With, ast.AsyncWith)):
            continue
        for item in node.items:
            label = transaction_label(item.context_expr, scope)
            if label is not None:
                django = is_django_scope(item.context_expr, scope)
                owners = set() if django else owner_names(node)
                blocks.append(Block(node, label, django, owners, item.context_expr))
    return sorted(blocks, key=lambda block: (block.node.lineno, block.node.col_offset))


def is_decorated_atomic(function, scope):
    return any(
        transaction_label(node, scope) is not None
        for decorator in function.decorator_list
        for node in ast.walk(decorator)
        if isinstance(node, (ast.Name, ast.Attribute, ast.Call))
    )


def spans(block, node):
    start = (block.lineno, block.col_offset)
    end = (block.end_lineno, block.end_col_offset)
    return start <= (node.lineno, node.col_offset) <= end


def enclosing(blocks, node):
    return [block for block in blocks if spans(block.node, node)]


def session_base(call, sessions=frozenset()):
    names = chain_names(call.func)[:-1]
    for index, name in enumerate(names[:2]):
        if index == 1 and names[0] != "self":
            break
        if name[:1].isupper():
            return None
        named = (words_of(name) or [""])[-1] in DATABASE_WORDS
        if named or (index == 0 and name in sessions):
            return ".".join(names[: index + 1])
    return None


def is_manager_call(call):
    return DJANGO_MANAGER in chain_names(call.func)[:-1]


def model_key(call):
    names = chain_names(call.func)
    if DJANGO_MANAGER in names[:-1]:
        return ".".join(names[: names.index(DJANGO_MANAGER)])
    return base_text(call.func.value) or ""


def target_key(call):
    if call.args:
        return ast.unparse(call.args[0])
    return model_key(call)
