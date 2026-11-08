import ast
import re

from checks.common import dotted_name, finding, own_nodes
from queries.query_chains import ORM_MODULES, chain_of, imports_any
from security.resolve.scopes import scope_of

RULE = "unbounded-query-array"
GUARDED = True
IN_STEPS = {"in_", "not_in", "notin_"}
INSERTS = {
    "sqlalchemy.insert",
    "sqlalchemy.sql.insert",
    "sqlalchemy.sql.expression.insert",
    "sqlalchemy.dialects.postgresql.insert",
    "sqlalchemy.dialects.sqlite.insert",
    "sqlalchemy.dialects.mysql.insert",
    "sqlmodel.insert",
}
COLLECTIONS = {
    "list",
    "set",
    "frozenset",
    "Sequence",
    "Iterable",
    "Collection",
    "List",
    "Set",
    "FrozenSet",
}
COLLECTIONS |= {"AbstractSet", "MutableSequence", "MutableSet"}
MAKERS = {"list", "set", "sorted", "frozenset", "tuple", "map", "filter"}
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.GeneratorExp)
CHUNK_NAME = re.compile(r"chunk|batch|partition|paginat|split", re.I)
NAME_LENGTH = 30


def annotation_name(annotation):
    node = annotation.value if isinstance(annotation, ast.Subscript) else annotation
    if isinstance(annotation, ast.Subscript) and isinstance(node, (ast.Name, ast.Attribute)):
        name = node.id if isinstance(node, ast.Name) else node.attr
        if name in {"tuple", "Tuple"}:
            items = annotation.slice.elts if isinstance(annotation.slice, ast.Tuple) else []
            return (
                "tuple"
                if items and isinstance(items[-1], ast.Constant) and items[-1].value is ...
                else None
            )
        return name
    if isinstance(node, ast.Name):
        return node.id
    return node.attr if isinstance(node, ast.Attribute) else None


def parameter(name, scope):
    arguments = scope.args
    every = [*arguments.posonlyargs, *arguments.args, *arguments.kwonlyargs]
    return next((item for item in every if item.arg == name), None)


def assignments(name, scope, context):
    root = scope or context.tree
    found = []
    for item in own_nodes(root):
        if isinstance(item, (ast.Assign, ast.AnnAssign)) and item.value is not None:
            targets = item.targets if isinstance(item, ast.Assign) else [item.target]
            if any(isinstance(target, ast.Name) and target.id == name for target in targets):
                found.append(item.value)
    return found


def fixed_iterable(node):
    if isinstance(node, (ast.List, ast.Tuple, ast.Set, ast.Constant)):
        return True
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "range":
        return all(isinstance(item, ast.Constant) for item in node.args)
    name = node.id if isinstance(node, ast.Name) else getattr(node, "attr", "")
    return name[:1].isupper()


def made_from(value):
    """The names a runtime collection is made from, or None when the value is not one."""
    if isinstance(value, COMPREHENSIONS):
        if all(fixed_iterable(generator.iter) for generator in value.generators):
            return None
        return {
            node.id
            for generator in value.generators
            for node in ast.walk(generator.iter)
            if isinstance(node, ast.Name)
        }
    if isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id in MAKERS:
        if value.args and not fixed_iterable(value.args[-1]):
            return {node.id for node in ast.walk(value.args[-1]) if isinstance(node, ast.Name)}
    return None


def runtime_sources(node, context, needs_evidence):
    """The names whose size bounds `node` when it is a runtime collection, or None."""
    if isinstance(node, COMPREHENSIONS):
        return made_from(node)
    if isinstance(node, ast.Attribute) and not needs_evidence:
        return {ast.unparse(node)} if isinstance(node.value, ast.Name) else None
    if not isinstance(node, ast.Name):
        return None
    scope = scope_of(node, context)
    values = assignments(node.id, scope, context)
    if values:
        made = [made_from(value) for value in values]
        return None if any(item is None for item in made) else {node.id}.union(*made)
    declared = (
        parameter(node.id, scope)
        if isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef))
        else None
    )
    if declared is None:
        return None
    if declared.annotation is None:
        return None if needs_evidence else {node.id}
    return {node.id} if annotation_name(declared.annotation) in COLLECTIONS | {"tuple"} else None


def operands(test):
    pending = [test]
    while pending:
        item = pending.pop()
        if isinstance(item, ast.BoolOp):
            pending.extend(item.values)
        elif isinstance(item, ast.UnaryOp) and isinstance(item.op, ast.Not):
            pending.append(item.operand)
        elif isinstance(item, ast.Compare):
            pending.extend([item.left, *item.comparators])
        else:
            yield item


def tests_size(node, sources):
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "len":
        return any(ast.unparse(item) in sources for item in node.args)
    tested = (ast.If, ast.While, ast.IfExp, ast.Assert)
    test = node.test if isinstance(node, tested) else None
    return test is not None and any(ast.unparse(item) in sources for item in operands(test))


def chunk_loop(name, node, context):
    current = node
    while current is not None:
        loops = [current] if isinstance(current, (ast.For, ast.AsyncFor)) else []
        loops += current.generators if isinstance(current, COMPREHENSIONS) else []
        for loop in loops:
            iterator = loop.iter
            called = (
                dotted_name(iterator.func, context.aliases)
                if isinstance(iterator, ast.Call)
                else None
            )
            if (
                isinstance(loop.target, ast.Name)
                and loop.target.id == name
                and CHUNK_NAME.search(called or "")
            ):
                return True
        if isinstance(current, (ast.FunctionDef, ast.AsyncFunctionDef)):
            decorators = [
                dotted_name(getattr(item, "func", item), context.aliases) or ""
                for item in current.decorator_list
            ]
            if any(CHUNK_NAME.search(item) for item in decorators):
                return True
        current = context.parents.get(id(current))
    return False


def bounded(node, sources, context):
    if any(chunk_loop(name, node, context) for name in sources):
        return True
    scope = scope_of(node, context)
    while scope is not None:
        if any(tests_size(item, sources) for item in ast.walk(scope)):
            return True
        scope = scope_of(scope, context)
    return False


def sink_array(call, context):
    function = call.func
    if not isinstance(function, ast.Attribute) or len(call.args) != 1 or call.keywords:
        return None, False
    if function.attr in IN_STEPS:
        return call.args[0], False
    if function.attr != "values":
        return None, False
    root, steps = chain_of(function.value)
    inserted = isinstance(root, ast.Call) and dotted_name(root.func, context.aliases) in INSERTS
    return (
        (call.args[0], True)
        if inserted or any(name == "insert" for name, _ in steps)
        else (None, False)
    )


def subject(node):
    text = ast.unparse(node)
    return text if len(text) <= NAME_LENGTH and "\n" not in text else "this list"


def check(context):
    if context.tests or not imports_any(context, ORM_MODULES):
        return []
    found = []
    for node in ast.walk(context.tree):
        array, needs_evidence = (
            sink_array(node, context) if isinstance(node, ast.Call) else (None, False)
        )
        sources = runtime_sources(array, context, needs_evidence) if array is not None else None
        if sources is not None and not bounded(array, sources, context):
            found.append(finding(context.path, RULE, subject(array), array))
    return found
