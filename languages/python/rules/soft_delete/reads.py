import ast
from collections import namedtuple

from checks.common import walk_statements
from kinds.index import functions_of
from kinds.names import chain_names
from kinds.receivers import callee_of
from soft_delete.fields import helper_names, is_intentional, mentions
from soft_delete.models import soft_models

Read = namedtuple("Read", "model field status helper node function")
WRITES = {
    "create",
    "update",
    "delete",
    "bulk_create",
    "bulk_update",
    "get_or_create",
    "update_or_create",
    "save",
    "insert",
}
ROOTS = {"query", "select", "select_from"}
RUNNERS = {"execute", "scalars", "scalar", "stream", "stream_scalars"}
EXECUTING = {
    "first",
    "last",
    "one",
    "one_or_none",
    "scalar",
    "scalar_one",
    "scalar_one_or_none",
    "count",
    "exists",
    "get",
    "aggregate",
    "fetchall",
    "fetchone",
    "in_bulk",
}
FILTERED, UNFILTERED, EXEMPT = "filtered", "unfiltered", "exempt"


def reference_name(node):
    while isinstance(node, (ast.Attribute, ast.Call, ast.Subscript)):
        node = node.func if isinstance(node, ast.Call) else node.value
    return node.id if isinstance(node, ast.Name) else None


def class_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def model_roots(function, models):
    for node in walk_statements(function.body):
        if isinstance(node, ast.Attribute) and node.attr == "objects":
            model = models.get(class_name(node.value))
            if model is not None and model.kind == "django":
                yield node, model
        elif (
            isinstance(node, ast.Call)
            and chain_names(node.func)[-1:]
            and (chain_names(node.func)[-1] in ROOTS)
        ):
            seen = set()
            for argument in node.args:
                name = reference_name(argument)
                model = models.get(name)
                if (
                    model is not None
                    and model.kind == "sqlalchemy"
                    and name not in seen
                ):
                    seen.add(name)
                    yield node, model


def outer_chain(node, parents):
    while True:
        parent = parents.get(id(node))
        if isinstance(parent, ast.Attribute) and parent.value is node:
            node = parent
        elif isinstance(parent, ast.Call) and parent.func is node:
            node = parent
        else:
            return node


def is_executed(chain, model):
    if not (isinstance(chain, ast.Call) and isinstance(chain.func, ast.Attribute)):
        return False
    name = chain.func.attr
    return name in EXECUTING or (
        model.kind == "sqlalchemy" and name in {"all", "scalars"}
    )


def chain_methods(chain):
    return {n.attr for n in ast.walk(chain) if isinstance(n, ast.Attribute)}


def constant_filters(node, model, context):
    for keyword in (n for n in ast.walk(node) if isinstance(n, ast.keyword)):
        if keyword.arg is None and isinstance(keyword.value, ast.Name):
            for statement in context.tree.body:
                if (
                    isinstance(statement, ast.Assign)
                    and any(
                        isinstance(t, ast.Name) and t.id == keyword.value.id
                        for t in statement.targets
                    )
                    and mentions(statement.value, model.fields)
                ):
                    return True
    return False


CONSUMERS = {"filter", "map", "sum", "any", "all", "sorted", "min", "max", "next"}


def consumer_of(node, parents):
    parent = parents.get(id(node))
    if isinstance(parent, ast.comprehension) and parent.iter is node:
        return parents.get(id(parent))
    if isinstance(parent, (ast.For, ast.AsyncFor)) and parent.iter is node:
        return parent
    if isinstance(parent, ast.Call) and node in parent.args:
        name = chain_names(parent.func)[-1:]
        if name and name[0] in CONSUMERS:
            return parent
    return None


def applies(node, model, helpers, context=None):
    if mentions(node, model.fields):
        return True
    if context is not None and constant_filters(node, model, context):
        return True
    return any(
        (isinstance(n, ast.Attribute) and n.attr in helpers)
        or (isinstance(n, ast.Name) and n.id in helpers)
        for n in ast.walk(node)
    )


def helper_of(node, helpers):
    for n in ast.walk(node):
        name = n.attr if isinstance(n, ast.Attribute) else getattr(n, "id", None)
        if name in helpers:
            return name
    return None


def status_of(chain, root, model, function, context, helpers):
    parent = context.parents.get(id(chain))
    if chain_methods(chain) & WRITES:
        return EXEMPT, None
    if applies(chain, model, helpers, context):
        return FILTERED, helper_of(chain, helpers)
    if is_executed(chain, model):
        return UNFILTERED, None
    consumer = consumer_of(chain, context.parents)
    if consumer is not None and applies(consumer, model, helpers, context):
        return FILTERED, helper_of(consumer, helpers)
    if isinstance(parent, (ast.Return, ast.Yield, ast.YieldFrom)):
        return EXEMPT, None
    if isinstance(parent, ast.Call) and parent.func is not chain:
        return passed_status(parent, context)
    if isinstance(parent, ast.Assign) and isinstance(parent.targets[0], ast.Name):
        return assigned_status(parent.targets[0].id, function, context, model, helpers)
    return UNFILTERED, None


def passed_status(call, context):
    names = chain_names(call.func)
    if names[-1:] and names[-1] in RUNNERS:
        return UNFILTERED, None
    return (
        (EXEMPT, None)
        if callee_of(call.func, context) is not None
        else (UNFILTERED, None)
    )


def assigned_status(name, function, context, model, helpers):
    for node in walk_statements(function.body):
        if isinstance(node, ast.Call):
            exposed = [a for a in node.args if isinstance(a, ast.Name) and a.id == name]
            if exposed and callee_of(node.func, context) is not None:
                return EXEMPT, None
        if isinstance(node, ast.Name) and node.id == name:
            consumer = consumer_of(node, context.parents)
            if consumer is not None and applies(consumer, model, helpers, context):
                return FILTERED, helper_of(consumer, helpers)
        if isinstance(node, ast.Attribute) and reference_name(node) == name:
            chain = outer_chain(node, context.parents)
            if applies(chain, model, helpers, context):
                return FILTERED, helper_of(chain, helpers)
    return UNFILTERED, None


def reads_of(context):
    def build(_):
        project = context.project
        models, helpers = soft_models(project), helper_names(project)
        found = []
        for qualified, function in functions_of(context):
            if is_intentional(qualified, context.path):
                continue
            for root, model in model_roots(function, models):
                chain = outer_chain(root, context.parents)
                status, helper = status_of(
                    chain, root, model, function, context, helpers
                )
                if status != EXEMPT:
                    field = sorted(model.fields)[0]
                    found.append(
                        Read(model.name, field, status, helper, chain, qualified)
                    )
        return found

    return context.project.memo(("soft-reads", context.path), build)
