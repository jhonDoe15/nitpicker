import ast

from design.calls.calls import resolve_call
from design.resolve.evaluate import evaluate
from design.resolve.lookup import lookup
from design.resolve.symbols import Function, Variable
from design.support.astutil import FUNCTIONS

TABLES = (ast.Dict, ast.List, ast.Tuple, ast.Set)


def import_time_nodes(statements):
    nodes = []
    pending = list(statements)
    for node in pending:
        if isinstance(node, FUNCTIONS):
            arguments = node.args
            defaults = [d for d in arguments.defaults + arguments.kw_defaults if d]
            pending.extend(node.decorator_list + defaults)
        elif isinstance(node, ast.ClassDef):
            keywords = [keyword.value for keyword in node.keywords]
            pending.extend(node.decorator_list + node.bases + keywords + node.body)
        elif not is_all_assignment(node):
            nodes.append(node)
            pending.extend(ast.iter_child_nodes(node))
    return nodes


def is_all_assignment(node):
    targets = getattr(node, "targets", None) or [getattr(node, "target", None)]
    return isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)) and any(
        isinstance(target, ast.Name) and target.id == "__all__" for target in targets
    )


def is_value_use(scope, node):
    if not isinstance(node, (ast.Name, ast.Attribute)) or not isinstance(
        node.ctx, ast.Load
    ):
        return False
    parent = scope.module.parents.get(id(node))
    if isinstance(parent, ast.Call) and parent.func is node:
        return False
    return not isinstance(parent, ast.Attribute)


def function_value(scope, node):
    value = evaluate(scope, node)
    if value is None or value[0] != "func" or not isinstance(value[1], Function):
        return None
    return value[1]


def value_functions(scope, nodes):
    found = []
    for node in nodes:
        function = function_value(scope, node) if is_value_use(scope, node) else None
        if function is not None:
            found.append((node, function))
    return found


def table_functions(scope, nodes):
    found = []
    for node in nodes:
        if not isinstance(node, ast.Name) or node.id in scope.sites:
            continue
        entity = lookup(scope.index, scope.module, node.id)
        table = table_value(entity)
        if table is not None:
            owner = scope.index.module_scope(entity.module)
            found.extend((node, f) for _, f in value_functions(owner, ast.walk(table)))
    return found


def table_value(entity):
    if not isinstance(entity, Variable) or len(entity.statements) != 1:
        return None
    value = getattr(entity.statements[0], "value", None)
    return value if isinstance(value, TABLES) else None


def ordered_ids(pairs, skip=None):
    ids = []
    for _, function in sorted(
        pairs, key=lambda pair: (pair[0].lineno, pair[0].col_offset)
    ):
        if function.id != skip and function.id not in ids:
            ids.append(function.id)
    return ids


def callable_references(scope):
    nodes = [n for statement in scope.function.node.body for n in ast.walk(statement)]
    pairs = value_functions(scope, nodes) + table_functions(scope, nodes)
    return ordered_ids(pairs, scope.function.id)


def module_references(index, module):
    scope = index.module_scope(module)
    nodes = import_time_nodes(module.tree.body)
    pairs = value_functions(scope, nodes)
    for node in nodes:
        resolution = resolve_call(scope, node) if isinstance(node, ast.Call) else None
        if resolution is not None:
            pairs.append((node, resolution.target))
    return ordered_ids(pairs)
