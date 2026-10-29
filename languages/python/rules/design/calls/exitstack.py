import ast

from checks.common import dotted_name
from design.calls.calls import receiver_key
from design.calls.cleanup import fact, item_enter_facts, item_facts, member_function
from design.resolve.evaluate import type_of
from design.support.astutil import call_line

EXIT_STACKS = {"contextlib.ExitStack", "contextlib.AsyncExitStack"}
CALLBACKS = {"callback", "push_async_callback"}
ENTERS = {"enter_context": ast.With, "enter_async_context": ast.AsyncWith}


def is_exit_stack(scope, name):
    sites = scope.sites.get(name, [])
    if len(sites) != 1 or sites[0].kind != "with":
        return False
    expression = sites[0].value
    return isinstance(expression, ast.Call) and (
        dotted_name(expression.func, scope.module.aliases) in EXIT_STACKS
    )


def stack_method(scope, call):
    func = call.func
    if not isinstance(func, ast.Attribute) or not isinstance(func.value, ast.Name):
        return None
    return func.attr if is_exit_stack(scope, func.value.id) else None


def callback_facts(scope, call):
    reference = call.args[0]
    if not isinstance(reference, ast.Attribute):
        return []
    klass = type_of(scope, reference.value)
    function = member_function(scope.index, klass, reference.attr)
    key = receiver_key(scope, reference.value)
    if function is None or key is None:
        return []
    return [fact(function, key, call_line(call))]


def entered_facts(scope, call, statement_type):
    item = ast.withitem(context_expr=call.args[0], optional_vars=None)
    statement = statement_type(items=[item], body=[], lineno=call_line(call))
    return item_enter_facts(scope, item, statement) + item_facts(scope, item, statement)


def stack_facts(scope, call):
    method = stack_method(scope, call)
    if method in CALLBACKS and call.args:
        return callback_facts(scope, call)
    if method in ENTERS and len(call.args) == 1:
        return entered_facts(scope, call, ENTERS[method])
    return []
