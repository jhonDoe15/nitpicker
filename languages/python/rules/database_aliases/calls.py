import ast

from checks.common import dotted_name, last_name, walk_statements
from database_aliases.passing import (
    derived_names,
    keyword_using,
    wrong_argument,
)
from django_models.graph import project_graph
from django_models.origin import is_class_alias
from orm.models import is_django_model
from orm.origins import DJANGO_MANAGERS
from signal_receivers.receivers import project_receivers
from soft_delete.reads import EXECUTING, WRITES, consumer_of, outer_chain

BOUND_CALLS = {"using", "db_manager"}
RUNNING = EXECUTING | WRITES | {"iterator"}
MATERIALIZERS = {"list", "set", "tuple", "len", "sorted", "bool", "dict"}
ROW_METHODS = {"get", "first", "last", "create", "earliest", "latest"}
INSTANCE_WRITES = {"save": 2, "delete": 0}
TRANSACTIONS = {
    "django.db.transaction.atomic": 0,
    "django.db.transaction.set_rollback": 1,
    "django.db.transaction.on_commit": 1,
}


def model_names(project):
    def build(_):
        return {
            model.name
            for model in project_graph(project).by_key.values()
            if not model.context.tests
        }

    return project.memo("alias-models", build)


def registry_names(function):
    return {
        target.id
        for node in walk_statements(function.body)
        if isinstance(node, ast.Assign) and is_get_model(node.value)
        for target in node.targets
        if isinstance(target, ast.Name)
    }


def is_get_model(node):
    return isinstance(node, ast.Call) and last_name(node.func) == "get_model"


def is_model_root(node, names, sender):
    if isinstance(node, ast.Name):
        return node.id in names or node.id == sender
    return is_class_alias(node) or (
        isinstance(node, ast.Attribute) and node.attr == "model"
    )


def query_roots(function, context):
    names = model_names(context.project) | registry_names(function)
    sender = "sender" if "sender" in {a.arg for a in function.args.args} else None
    for node in walk_statements(function.body):
        if isinstance(node, ast.Attribute) and node.attr in DJANGO_MANAGERS:
            if is_model_root(node.value, names, sender):
                yield node


def binding_calls(chain, function, context):
    nodes = list(ast.walk(chain))
    parent = context.parents.get(id(chain))
    if isinstance(parent, ast.Assign) and isinstance(parent.targets[0], ast.Name):
        name = parent.targets[0].id
        nodes += [
            n
            for n in walk_statements(function.body)
            if isinstance(n, ast.Attribute) and getattr(n.value, "id", None) == name
        ]
    return [
        context.parents[id(n)]
        for n in nodes
        if isinstance(n, ast.Attribute)
        and n.attr in BOUND_CALLS
        and isinstance(context.parents.get(id(n)), ast.Call)
    ]


def bound_state(chain, function, context, alias):
    calls = binding_calls(chain, function, context)
    if not calls:
        return None
    names = derived_names(function, alias)
    wrong = [c for c in calls if c.args and wrong_argument(c.args[:1], names)]
    return ast.unparse(wrong[0]) if len(wrong) == len(calls) else ""


def runs_query(chain, context):
    called = isinstance(chain, ast.Call) and isinstance(chain.func, ast.Attribute)
    if called and chain.func.attr in RUNNING:
        return True
    parent = context.parents.get(id(chain))
    if isinstance(parent, ast.Call) and chain in parent.args:
        if last_name(parent.func) in MATERIALIZERS:
            return True
    return consumer_of(chain, context.parents) is not None


def unbound_queries(function, context, alias):
    for root in query_roots(function, context):
        chain = outer_chain(root, context.parents)
        if not runs_query(chain, context):
            continue
        state = bound_state(chain, function, context, alias)
        if state is None:
            yield chain, ast.unparse(root), False
        elif state:
            yield chain, state, True


def root_name(node):
    while isinstance(node, (ast.Attribute, ast.Call)):
        node = node.func if isinstance(node, ast.Call) else node.value
    return node.id if isinstance(node, ast.Name) else None


def is_row_source(value, models):
    if not isinstance(value, ast.Call):
        return False
    if root_name(value) in models and isinstance(value.func, ast.Name):
        return True
    manager = any(
        isinstance(n, ast.Attribute) and n.attr in DJANGO_MANAGERS
        for n in ast.walk(value)
    )
    method = getattr(value.func, "attr", None)
    return manager and method in ROW_METHODS and root_name(value) in models


def receiver_models(function, context):
    return {
        r.sender
        for r in project_receivers(context.project)
        if r.function is function and r.sender
    }


def instance_names(function, context):
    models = model_names(context.project)
    names = set()
    owner = context.parents.get(id(function))
    if isinstance(owner, ast.ClassDef) and is_django_model(owner, context):
        names.add("self")
    for arg in function.args.args:
        kind = ast.unparse(arg.annotation).rsplit(".", 1)[-1] if arg.annotation else ""
        if kind in models:
            names.add(arg.arg)
        if arg.arg == "instance" and receiver_models(function, context) & models:
            names.add(arg.arg)
    for node in walk_statements(function.body):
        if isinstance(node, ast.Assign) and is_row_source(node.value, models):
            names.update(t.id for t in node.targets if isinstance(t, ast.Name))
        if isinstance(node, ast.For) and isinstance(node.target, ast.Name):
            if root_name(node.iter) in models:
                names.add(node.target.id)
    return names


def has_starred(call, index):
    return any(isinstance(a, ast.Starred) for a in call.args[: index + 1])


def passes(call, index, names):
    positional = [] if has_starred(call, index) else call.args[index:][:1]
    given = keyword_using(call) + positional
    if not given:
        return None
    return wrong_argument(given, names) is None


def is_super_call(node):
    return isinstance(node, ast.Call) and last_name(node.func) == "super"


def write_owner(owner, names):
    if is_super_call(owner):
        return "super()"
    return owner.id if getattr(owner, "id", None) in names else None


def unbound_writes(function, context, alias):
    names = instance_names(function, context)
    aliases = derived_names(function, alias)
    for node in walk_statements(function.body):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
            continue
        method = node.func.attr
        owner = write_owner(node.func.value, names)
        if method in INSTANCE_WRITES and owner is not None:
            state = passes(node, INSTANCE_WRITES[method], aliases)
            if state is not True:
                yield node, f"{owner}.{method}()", state is False


def unbound_transactions(function, context, alias):
    aliases = derived_names(function, alias)
    for node in walk_statements(function.body):
        if not isinstance(node, ast.Call):
            continue
        index = TRANSACTIONS.get(dotted_name(node.func, context.aliases))
        if index is not None:
            state = passes(node, index, aliases)
            if state is not True:
                yield node, f"{ast.unparse(node.func)}()", state is False
