import ast

from checks.common import finding, last_name, own_nodes
from lifecycles.scopes import FUNCTIONS, blocks_of, is_fixture
from restores.pairs import add_statement, index_of, new_index, scope_of, undo_match

RULE = "reset-skipped-on-failure"
CONTEXT_MANAGERS = {"contextmanager", "asynccontextmanager"}
BROAD = {"BaseException", "Exception"}


def is_context_manager(function):
    return any(
        last_name(item.func if isinstance(item, ast.Call) else item) in CONTEXT_MANAGERS
        for item in function.decorator_list
    )


def is_yield(statement):
    if isinstance(statement, ast.Expr):
        return isinstance(statement.value, (ast.Yield, ast.YieldFrom))
    value = getattr(statement, "value", None)
    return isinstance(statement, ast.Assign) and isinstance(value, ast.Yield)


def broad_handler(handler):
    kind = handler.type
    return kind is None or last_name(kind) in BROAD


def protects(parent, child):
    if not isinstance(parent, ast.Try) or child in parent.finalbody:
        return False
    return bool(parent.finalbody) or (
        child in parent.body and any(map(broad_handler, parent.handlers))
    )


def guards(function, parents, statement):
    child = statement
    while child is not function:
        parent = parents[id(child)]
        if protects(parent, child):
            return True
        child = parent
    return False


def statements_before(function, line):
    return [
        node
        for node in own_nodes(function)
        if isinstance(node, ast.stmt) and node.lineno < line
    ]


def is_lifespan(context, function):
    arguments = function.args.posonlyargs + function.args.args
    if function.name == "lifespan" or (arguments and arguments[0].arg == "app"):
        return True
    return any(
        keyword.arg == "lifespan"
        and isinstance(keyword.value, ast.Name)
        and keyword.value.id == function.name
        for node in ast.walk(context.tree)
        if isinstance(node, ast.Call)
        for keyword in node.keywords
    )


def manager_findings(context, function):
    found = []
    scope = scope_of(function, False)
    for block in blocks_of(function):
        for index, statement in enumerate(block):
            if not is_yield(statement) or guards(function, context.parents, statement):
                continue
            earlier = index_of(statements_before(function, statement.lineno))
            for later in block[index + 1 :]:
                match = undo_match(later, earlier, scope)
                if match is not None:
                    subject = f"{function.name}: {match[1]}"
                    found.append(finding(context.path, RULE, subject, later))
                    break
    return found


def has_call(statements):
    return any(
        isinstance(node, ast.Call) for item in statements for node in ast.walk(item)
    )


def has_yield_node(function):
    return any(
        isinstance(node, (ast.Yield, ast.YieldFrom)) for node in own_nodes(function)
    )


def sequence_findings(context, function):
    found = []
    scope = scope_of(function, True)
    for block in blocks_of(function):
        earlier = new_index()
        for index, statement in enumerate(block):
            match = undo_match(statement, earlier, scope)
            if match is not None and has_call(block[block.index(match[0]) + 1 : index]):
                subject = f"{function.name}: {match[1]}"
                found.append(finding(context.path, RULE, subject, statement))
            add_statement(earlier, statement)
    return found


def check(context):
    if context.tests:
        return []
    found = []
    for function in ast.walk(context.tree):
        if not isinstance(function, FUNCTIONS):
            continue
        if is_context_manager(function):
            if not is_lifespan(context, function):
                found.extend(manager_findings(context, function))
        elif not is_fixture(function) and not has_yield_node(function):
            found.extend(sequence_findings(context, function))
    return found
