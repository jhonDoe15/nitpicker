import ast

from checks.common import finding

RULE = "self-recursion"
DEFS = (ast.FunctionDef, ast.AsyncFunctionDef)
ITERATING = {"map", "filter", "sorted", "min", "max", "reduce", "starmap", "takewhile", "dropwhile"}
RECEIVERS = {"self", "cls"}


def own_nodes(function):
    pending = list(function.body)
    while pending:
        node = pending.pop()
        yield node
        if not isinstance(node, (*DEFS, ast.ClassDef)):
            pending.extend(ast.iter_child_nodes(node))


def named_functions(body):
    return {node.name: node for node in body if isinstance(node, DEFS)}


def scope_table(tree):
    parents = {}
    pending = [(tree, None, None)]
    while pending:
        node, function, owner = pending.pop()
        for child in ast.iter_child_nodes(node):
            if isinstance(child, DEFS):
                parents[id(child)] = (function, owner)
                pending.append((child, child, None))
            elif isinstance(child, ast.ClassDef):
                pending.append((child, function, child))
            else:
                pending.append((child, function, owner))
    return parents


def lookup(function, name, parents, tree):
    current = function
    while current is not None:
        nested = named_functions(current.body)
        if name in nested and nested[name] is not current:
            return nested[name]
        if current.name == name and method_owner(current, parents) is None:
            return current
        current = parents[id(current)][0]
    return named_functions(tree.body).get(name)


def bound_names(function):
    arguments = function.args
    every = arguments.posonlyargs + arguments.args + arguments.kwonlyargs
    names = {argument.arg for argument in every}
    names.update(a.arg for a in (arguments.vararg, arguments.kwarg) if a is not None)
    for node in own_nodes(function):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
    return names


def method_owner(function, parents):
    return parents[id(function)][1]


def callee_name(call):
    callee = call.func
    return callee.id if isinstance(callee, ast.Name) else None


def referenced(node):
    if not isinstance(node, ast.Call):
        return []
    found = [node.func]
    if callee_name(node) in ITERATING or (
        isinstance(node.func, ast.Attribute) and node.func.attr in ITERATING
    ):
        found.extend(node.args)
    return found


def target_of(reference, function, parents, tree, locals_):
    if isinstance(reference, ast.Name):
        if reference.id in locals_ and function.name != reference.id:
            return None
        return lookup(function, reference.id, parents, tree)
    if (
        isinstance(reference, ast.Attribute)
        and isinstance(reference.value, ast.Name)
        and reference.value.id in RECEIVERS
    ):
        owner = method_owner(function, parents)
        if owner is not None:
            return named_functions(owner.body).get(reference.attr)
    return None


def edges_of(tree):
    parents = scope_table(tree)
    functions = [
        node
        for node in ast.walk(tree)
        if isinstance(node, DEFS) and id(node) in parents
    ]
    edges = []
    for function in functions:
        locals_ = bound_names(function)
        for node in own_nodes(function):
            for reference in referenced(node):
                target = target_of(reference, function, parents, tree, locals_)
                if target is not None:
                    edges.append((function, target, reference))
    return edges, parents


def reachable(start, edges):
    seen = {id(start)}
    pending = [start]
    while pending:
        current = pending.pop()
        for source, target, _ in edges:
            if source is current and id(target) not in seen:
                seen.add(id(target))
                pending.append(target)
    return seen


def contains(outer, inner, parents):
    current = parents[id(inner)][0]
    while current is not None:
        if current is outer:
            return True
        current = parents[id(current)][0]
    return False


def first_in_cycle(source, edges):
    members = [
        member
        for _, member, _ in edges
        if id(source) in reachable(member, edges) and id(member) in reachable(source, edges)
    ]
    return all((source.lineno, source.col_offset) <= (m.lineno, m.col_offset) for m in members)


def calls_back(source, target, edges):
    return any(a is target and b is source for a, b, _ in edges)


def starts_cycle(edge, edges, parents):
    source, target, _ = edge
    if id(source) not in reachable(target, edges):
        return False
    if contains(source, target, parents) and calls_back(source, target, edges):
        return False
    return first_in_cycle(source, edges)


def report(edge, edges, parents, context):
    source, target, node = edge
    if source is target:
        return finding(context.path, RULE, source.name, node)
    if contains(target, source, parents) and id(source) in reachable(target, edges):
        return finding(context.path, RULE, target.name, node)
    if starts_cycle(edge, edges, parents):
        return finding(context.path, RULE, f"{source.name} <-> {target.name}", node)
    return None


def check(context):
    if context.tests:
        return []
    edges, parents = edges_of(context.tree)
    reports = (report(edge, edges, parents, context) for edge in edges)
    return [item for item in reports if item is not None]
