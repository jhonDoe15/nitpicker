import ast
from collections import Counter

from signatures.annotations import FUNCTION_TYPES, members_of, parameters_of
from truthiness.numbers import bound_names
from truthiness.sources import enclosing, is_queryset_expression, receiver_class

SEQUENCE_TYPES = {"list", "List", "Sequence", "MutableSequence"}
COLLECTORS = {"list", "sorted", "tuple"}
QUERY_ENDS = {"fetchall", "all", "scalars"}
GROWERS = {"append", "extend", "insert"}
COMPREHENSIONS = (ast.ListComp, ast.GeneratorExp, ast.SetComp)


def is_filtered_comprehension(node):
    return isinstance(node, COMPREHENSIONS) and any(
        generator.ifs for generator in node.generators
    )


def is_query_function(function, project):
    annotated = set(members_of(function.returns)) & SEQUENCE_TYPES
    return bool(annotated) and any(
        is_queryset_expression(node, project)
        or (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in QUERY_ENDS
        )
        for node in ast.walk(function)
    )


def query_functions(project):
    def build(_):
        counts, classes, top = Counter(), {}, {}
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if isinstance(node, ast.ClassDef):
                    counts[node.name] += 1
                    classes.setdefault(node.name, set()).update(
                        item.name
                        for item in node.body
                        if isinstance(item, FUNCTION_TYPES)
                        and is_query_function(item, project)
                    )
                elif isinstance(node, ast.Module):
                    for item in node.body:
                        if isinstance(item, FUNCTION_TYPES):
                            top.setdefault(item.name, []).append(item)
        unique = {name: classes[name] for name, total in counts.items() if total == 1}
        found = {
            name
            for name, items in top.items()
            if len(items) == 1 and is_query_function(items[0], project)
        }
        return unique, found

    return project.memo("query-functions", build)


def is_filter_call(node):
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "filter"
    )


def is_collected(node, project):
    is_collector = (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in COLLECTORS
        and len(node.args) == 1
    )
    if not is_collector:
        return False
    source = node.args[0]
    return (
        is_filter_call(source)
        or is_filtered_comprehension(source)
        or is_queryset_expression(source, project)
    )


def is_query_call(node, context):
    if not isinstance(node, ast.Call):
        return False
    classes, top = query_functions(context.project)
    if isinstance(node.func, ast.Name):
        return node.func.id in top
    if not isinstance(node.func, ast.Attribute):
        return False
    function = enclosing(node, context, FUNCTION_TYPES)
    owner = receiver_class(node.func.value, function, context)
    return node.func.attr in classes.get(owner, ())


def is_emptiable(node, context):
    return (
        is_filtered_comprehension(node)
        or is_filter_call(node)
        or is_collected(node, context.project)
        or is_query_call(node, context)
    )


def grown_names(nodes):
    return {
        node.func.value.id
        for node in nodes
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in GROWERS
        and isinstance(node.func.value, ast.Name)
    } | {
        node.target.id
        for node in nodes
        if isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name)
    }


def assigned_sources(nodes, context):
    counts = {}
    for node in nodes:
        for name in bound_names(node):
            counts[name] = counts.get(name, 0) + 1
    return {
        node.targets[0].id
        for node in nodes
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and counts[node.targets[0].id] == 1
        and is_emptiable(node.value, context)
    }


def tests_emptiness(nodes, name):
    for node in nodes:
        test = getattr(node, "test", None)
        if isinstance(node, (ast.If, ast.IfExp, ast.While, ast.Assert)):
            if test is not None and mentions_emptiness(test, name):
                return True
    return False


def mentions_emptiness(test, name):
    for node in ast.walk(test):
        is_name = isinstance(node, ast.Name) and node.id == name
        is_length = (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "len"
            and any(isinstance(arg, ast.Name) and arg.id == name for arg in node.args)
        )
        if is_name or is_length:
            return True
    return False


def parameter_sources(function, nodes):
    bound = {name for node in nodes for name in bound_names(node)}
    return {
        argument.arg
        for argument in parameters_of(function)
        if set(members_of(argument.annotation)) & SEQUENCE_TYPES
        and argument.arg not in bound
        and tests_emptiness(nodes, argument.arg)
    }


def source_names(function, nodes, context):
    names = assigned_sources(nodes, context) | parameter_sources(function, nodes)
    return names - grown_names(nodes)
