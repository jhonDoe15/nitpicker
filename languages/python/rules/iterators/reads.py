import ast

from checks.common import last_name
from checks.loop_scope import ancestors as loop_scope_ancestors
from reach.callees import callee_key
from reach.flow import walk_scope
from signatures.annotations import FUNCTION_TYPES
from signatures.scopes import key_of

CONSUMERS = {
    "list",
    "tuple",
    "set",
    "frozenset",
    "sorted",
    "sum",
    "min",
    "max",
    "any",
    "all",
    "len",
    "dict",
    "enumerate",
    "zip",
    "map",
    "filter",
    "reversed",
    "iter",
    "Counter",
    "deque",
    "chain",
    "reduce",
}
METHOD_CONSUMERS = {"join", "extend", "update", "writelines"}
TERMINAL = (ast.Return, ast.Raise, ast.Continue, ast.Break)
LOOPS = (ast.For, ast.AsyncFor, ast.While)
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
SELF_NAMES = {"self", "cls"}


def matches(node, key):
    return key_of(node) == key and isinstance(getattr(node, "ctx", None), ast.Load)


def positional_names(function):
    arguments = function.args
    names = [argument.arg for argument in [*arguments.posonlyargs, *arguments.args]]
    return names[1:] if names[:1] and names[0] in SELF_NAMES else names


def function_index(project):
    def build(_):
        found = {}
        for path, context in project.contexts.items():
            if path in project.test_files:
                continue
            for node in ast.walk(context.tree):
                if isinstance(node, FUNCTION_TYPES):
                    found.setdefault((path, node.name), (node, context))
        return found

    return project.memo(("one-shot-functions",), build)


def consumed_parameters(key, project):
    cache = project.memo(("one-shot-consumed",), lambda _: {})
    if key not in cache:
        cache[key] = ([], set())
        found = function_index(project).get(key)
        if found is not None:
            function, owner = found
            names, nodes = positional_names(function), walk_scope(function)
            taken = {name for name in names if direct_reads(nodes, name, owner, False)}
            cache[key] = (names, taken)
    return cache[key]


def callee_consumes(call, key, context):
    names, taken = consumed_parameters(callee_key(call, context), context.project)
    by_position = [
        names[index]
        for index, arg in enumerate(call.args)
        if index < len(names) and matches(arg, key)
    ]
    by_keyword = [item.arg for item in call.keywords if item.arg and matches(item.value, key)]
    return bool(taken & {*by_position, *by_keyword})


def call_reads(node, key, context, through_calls):
    func = node.func
    name = last_name(func)
    method = isinstance(func, ast.Attribute) and func.attr in METHOD_CONSUMERS
    found = [arg for arg in node.args if matches(arg, key)] if name in CONSUMERS or method else []
    found = found[:1] if name == "zip" else found
    found += [
        arg.value for arg in node.args if isinstance(arg, ast.Starred) and matches(arg.value, key)
    ]
    if not found and through_calls and callee_consumes(node, key, context):
        found = [arg for arg in node.args if matches(arg, key)] or [
            item.value for item in node.keywords if matches(item.value, key)
        ]
    return found


def direct_reads(nodes, key, context, through_calls=True):
    found = []
    for node in nodes:
        if isinstance(node, (ast.For, ast.AsyncFor)) and matches(node.iter, key):
            found.append(node.iter)
        elif isinstance(node, COMPREHENSIONS):
            found.extend(gen.iter for gen in node.generators if matches(gen.iter, key))
        elif isinstance(node, ast.Compare):
            found.extend(
                comparator
                for op, comparator in zip(node.ops, node.comparators)
                if isinstance(op, (ast.In, ast.NotIn)) and matches(comparator, key)
            )
        elif isinstance(node, ast.Call):
            found.extend(call_reads(node, key, context, through_calls))
        elif isinstance(node, (ast.List, ast.Tuple, ast.Set)):
            found.extend(
                item.value
                for item in node.elts
                if isinstance(item, ast.Starred) and matches(item.value, key)
            )
        elif isinstance(node, ast.Assign) and isinstance(node.targets[0], (ast.Tuple, ast.List)):
            found.extend([node.value] if matches(node.value, key) else [])
        elif isinstance(node, ast.YieldFrom) and matches(node.value, key):
            found.append(node.value)
    return sorted(found, key=lambda item: (item.lineno, item.col_offset))


def ancestors(node, context):
    return loop_scope_ancestors(node, context.parents)[1:]


def parent_pairs(node, context):
    chain = [node, *ancestors(node, context)]
    return {id(parent): (parent, child) for child, parent in zip(chain, chain[1:])}


def branch_of(parent, child):
    if isinstance(parent, ast.If):
        return "body" if child in parent.body else "orelse" if child in parent.orelse else None
    if isinstance(parent, ast.Match):
        return parent.cases.index(child) if child in parent.cases else None
    if isinstance(parent, ast.Try) and child in parent.handlers:
        return parent.handlers.index(child)
    return None


def statement_lists(parent):
    fields = ("body", "orelse", "finalbody")
    return [value for field in fields if isinstance(value := getattr(parent, field, None), list)]


def ends_before(first, second, context):
    shared = {id(item) for item in ancestors(second, context)}
    for pid, (parent, child) in parent_pairs(first, context).items():
        if pid in shared:
            return False
        for block in statement_lists(parent):
            if child in block and any(
                isinstance(item, TERMINAL) for item in block[block.index(child) :]
            ):
                return True
    return False


def exclusive(first, second, context):
    later = parent_pairs(second, context)
    for pid, (parent, child) in parent_pairs(first, context).items():
        if pid in later:
            mine, theirs = branch_of(parent, child), branch_of(parent, later[pid][1])
            if mine is not None and theirs is not None and mine != theirs:
                return True
    return ends_before(first, second, context)


def repeats(read, binding, context):
    for parent in ancestors(read, context):
        if isinstance(parent, FUNCTION_TYPES):
            return False
        if isinstance(parent, LOOPS) and inside(read, parent.body + parent.orelse, context):
            if not inside(binding, [parent], context) and not has_exit(parent):
                return True
        if isinstance(parent, COMPREHENSIONS) and not inside(
            read, [g.iter for g in parent.generators[:1]], context
        ):
            if not inside(binding, [parent], context):
                return True
    return False


def inside(node, roots, context):
    return any(item is root for item in [node, *ancestors(node, context)] for root in roots)


def has_exit(loop):
    return any(isinstance(item, (ast.Break, ast.Return)) for item in ast.walk(loop))
