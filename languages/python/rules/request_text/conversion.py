import ast
import re

from checks.common import dotted_name, finding, own_nodes
from contracts.web import (
    imports_web,
    is_injected,
    is_web_class,
    parameters_with_defaults,
    route_decorators,
    takes_request_first,
)
from django_models.graph import project_graph
from django_models.lookups import resolve_lookup
from django_models.origin import model_of_class, queryset_model, terminal_call
from security.resolve.scopes import enclosing_class
from security.support import exempt
from signatures.annotations import FUNCTION_TYPES, members_of

RULE = "unchecked-request-conversion"
GUARDED = True
REQUEST_PARAM = "request"
EXCEPTION_BASE = "Exception"
BASE_EXCEPTION = "BaseException"
FLOAT_NAME = "float"
REQUEST_NAMES = {REQUEST_PARAM, "req"}
REQUEST_ATTRS = {
    "GET",
    "POST",
    "query_params",
    "data",
    "args",
    "form",
    "headers",
    "path_params",
}
DIRECT_REQUEST_ATTRS = {"GET", "POST", "query_params", "path_params"}
RESPONSE_NAMES = {"response", "resp", "res", "http_response"}
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", REQUEST_PARAM}
HTTP_MODULES = {"requests", "httpx", "urllib3", "aiohttp"}
PASS_METHODS = {"get", "strip", "lstrip", "rstrip", "lower", "upper", "casefold", "title"}
VIEW_METHODS = {
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options",
    "list",
    "retrieve",
    "create",
    "update",
    "partial_update",
    "destroy",
}
SKIP_PARAMS = {"self", "cls", REQUEST_PARAM, "req", "response", "background_tasks"}
SUPPRESS_NAMES = {"contextlib.suppress", "suppress"}
ORM_METHODS = {"filter", "get", "exclude", "aget", "get_or_create", "update_or_create"}
ORM_SHORTCUTS = {"get_object_or_404", "aget_object_or_404", "get_list_or_404"}
ORM_EXCEPTIONS = {
    "ValidationError",
    "django.core.exceptions.ValidationError",
    "ValueError",
    EXCEPTION_BASE,
    BASE_EXCEPTION,
}
VALUE_EXCEPTIONS = {"ValueError", EXCEPTION_BASE, BASE_EXCEPTION}
DECIMAL_EXCEPTIONS = {
    "InvalidOperation",
    "decimal.InvalidOperation",
    "DecimalException",
    "decimal.DecimalException",
    "ArithmeticError",
    EXCEPTION_BASE,
    BASE_EXCEPTION,
}
CONVERTERS = {
    "uuid.UUID": ("UUID", VALUE_EXCEPTIONS, False),
    "UUID": ("UUID", VALUE_EXCEPTIONS, False),
    "int": ("int", VALUE_EXCEPTIONS, True),
    "builtins.int": ("int", VALUE_EXCEPTIONS, True),
    FLOAT_NAME: (FLOAT_NAME, VALUE_EXCEPTIONS, True),
    "builtins.float": (FLOAT_NAME, VALUE_EXCEPTIONS, True),
    "decimal.Decimal": ("Decimal", DECIMAL_EXCEPTIONS, True),
    "Decimal": ("Decimal", DECIMAL_EXCEPTIONS, True),
}
ROUTE_CONVERTER = re.compile(r"<(?:(\w+):)?(\w+)>")
TYPED_CONVERTERS = {"uuid", "int", FLOAT_NAME}
DIGIT_CHECKS = {"isdigit", "isdecimal", "isnumeric"}
REGEX_CHECKS = {"match", "fullmatch"}
EXIT_NODES = (ast.Return, ast.Raise, ast.Continue, ast.Break)
URL_PATH_CALLS = {"path", "django.urls.path"}


def route_view_target(node, context):
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "as_view"
    ):
        node = node.func.value
    dotted = dotted_name(node, context.aliases)
    if dotted:
        located = context.project.locate(dotted)
        if located is not None:
            return located
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        folder = context.path.rsplit("/", 1)[0] if "/" in context.path else ""
        sibling = f"{folder}/{node.value.id}.py" if folder else f"{node.value.id}.py"
        if sibling in context.project.contexts:
            return sibling, node.attr
    if isinstance(node, ast.Name):
        return context.path, node.id
    return None


def typed_url_params(project):
    def build(_):
        typed = set()
        for context in project.contexts.values():
            for node in ast.walk(context.tree):
                if not isinstance(node, ast.Call) or len(node.args) < 2:
                    continue
                if dotted_name(node.func, context.aliases) not in URL_PATH_CALLS:
                    continue
                pattern = node.args[0]
                target = route_view_target(node.args[1], context)
                if not (isinstance(pattern, ast.Constant) and isinstance(pattern.value, str) and target):
                    continue
                target_path, view = target
                for converter, param in ROUTE_CONVERTER.findall(pattern.value):
                    if converter in TYPED_CONVERTERS:
                        typed.add((target_path, view, param))
        return typed

    return project.memo("typed-url-params", build)


def decorator_typed_params(decorators):
    typed = set()
    for decorator in decorators:
        if not (isinstance(decorator, ast.Call) and decorator.args):
            continue
        first = decorator.args[0]
        if isinstance(first, ast.Constant) and isinstance(first.value, str):
            for converter, param in ROUTE_CONVERTER.findall(first.value):
                if converter in TYPED_CONVERTERS:
                    typed.add(param)
    return typed


def is_str_annotation(annotation):
    if annotation is None:
        return True
    if "pattern=" in ast.unparse(annotation) or "regex=" in ast.unparse(annotation):
        return False
    members = [name for name in members_of(annotation) if name != "None"]
    return members == ["str"]


def is_handler(function, context, web, decorators):
    if decorators:
        return True
    cls = enclosing_class(function, context)
    if cls is not None:
        if is_web_class(cls, context) and function.name in VIEW_METHODS:
            return True
        return web and takes_request_first(function, context, True)
    has_models = bool(project_graph(context.project).by_key)
    return (web or has_models) and takes_request_first(function, context, False)


def handler_view_name(function, context):
    cls = enclosing_class(function, context)
    return cls.name if cls is not None else function.name


def route_text_params(function, context, web, decorators):
    if not is_handler(function, context, web, decorators):
        return set(), set()
    view_name = handler_view_name(function, context)
    url_typed = {
        param
        for path, view, param in typed_url_params(context.project)
        if path == context.path and view == view_name
    }
    typed = decorator_typed_params(decorators) | url_typed
    params = set()
    for argument, default in parameters_with_defaults(function):
        name = argument.arg
        if name in SKIP_PARAMS or name in typed or is_injected(argument, default, context):
            continue
        if is_str_annotation(argument.annotation):
            params.add(name)
    return params, typed


def peel_once(node):
    if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or):
        return node.values[0]
    if isinstance(node, ast.Subscript):
        return node.value
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "str" and node.args:
        return node.args[0]
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in PASS_METHODS:
        return node.func.value
    return None


def peeled(node):
    current = node
    while True:
        nxt = peel_once(current)
        if nxt is None:
            return current
        current = nxt


def access_key(node):
    current = node
    while True:
        if isinstance(current, ast.Subscript):
            if isinstance(current.slice, ast.Constant) and isinstance(current.slice.value, str):
                return current.slice.value
            return None
        if isinstance(current, ast.Call) and isinstance(current.func, ast.Attribute):
            if current.func.attr == "get" and current.args:
                first = current.args[0]
                return first.value if isinstance(first, ast.Constant) and isinstance(first.value, str) else None
            if current.func.attr in PASS_METHODS:
                current = current.func.value
                continue
        if isinstance(current, ast.BoolOp) and isinstance(current.op, ast.Or):
            current = current.values[0]
            continue
        return None


def is_request_owner(owner, context):
    if isinstance(owner, ast.Name) and owner.id in REQUEST_NAMES:
        return True
    if (
        isinstance(owner, ast.Attribute)
        and owner.attr in REQUEST_NAMES
        and isinstance(owner.value, ast.Name)
        and owner.value.id == "self"
    ):
        return True
    dotted = dotted_name(owner, context.aliases) or ""
    return dotted.endswith(".request")


def is_http_call(node, context):
    if isinstance(node, ast.Await):
        node = node.value
    if not isinstance(node, ast.Call):
        return False
    dotted = dotted_name(node.func, context.aliases) or ""
    if dotted.split(".")[0] in HTTP_MODULES and dotted.rsplit(".", 1)[-1] in HTTP_METHODS:
        return True
    return isinstance(node.func, ast.Attribute) and node.func.attr in HTTP_METHODS and (
        isinstance(node.func.value, ast.Name)
        and node.func.value.id in {"session", "client", "http", "http_client"}
    )


def is_raw_container(node, context, web, http_responses):
    if not isinstance(node, ast.Attribute):
        return False
    if (
        node.attr == "headers"
        and isinstance(node.value, ast.Name)
        and (node.value.id in RESPONSE_NAMES or node.value.id in http_responses)
    ):
        return True
    if node.attr == "kwargs" and isinstance(node.value, ast.Name) and node.value.id == "self":
        return web
    if node.attr in DIRECT_REQUEST_ATTRS and is_request_owner(node.value, context):
        return True
    if node.attr in REQUEST_ATTRS and is_request_owner(node.value, context):
        return web or (dotted_name(node.value, context.aliases) or "").endswith(".request")
    return False


def is_self_kwargs(node):
    return (
        isinstance(node, ast.Attribute)
        and node.attr == "kwargs"
        and isinstance(node.value, ast.Name)
        and node.value.id == "self"
    )


def is_direct_untrusted(node, context, web, http_responses, raw_containers, typed_keys):
    source = peeled(node)
    if source is node:
        return False
    if is_self_kwargs(source):
        key = access_key(node)
        return web and (key is None or key not in typed_keys)
    if is_raw_container(source, context, web, http_responses):
        return True
    return isinstance(source, ast.Name) and source.id in raw_containers


def converter_info(call, context):
    dotted = dotted_name(call.func, context.aliases)
    if dotted not in CONVERTERS:
        return None
    label, exceptions, allow_digits = CONVERTERS[dotted]
    arg = call.args[0] if call.args else None
    if arg is None and label == "UUID":
        arg = next((kw.value for kw in call.keywords if kw.arg == "hex"), None)
    return (label, exceptions, allow_digits, arg) if arg is not None else None


def is_converter_call(node, context):
    return isinstance(node, ast.Call) and converter_info(node, context) is not None


def ordered_assignments(function):
    nodes = [
        node
        for node in own_nodes(function)
        if isinstance(node, (ast.Assign, ast.AnnAssign, ast.NamedExpr))
    ]
    nodes.sort(key=lambda item: (item.lineno, item.col_offset))
    return nodes


def assignment_target(node):
    if isinstance(node, ast.Assign):
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            return node.targets[0].id, node.value
        return None, None
    if (
        isinstance(node, (ast.AnnAssign, ast.NamedExpr))
        and isinstance(node.target, ast.Name)
        and node.value is not None
    ):
        return node.target.id, node.value
    return None, None


def collect_state(function, context, web, route_params, typed_keys):
    http_responses = set()
    raw_containers = set()
    tainted = set(route_params)
    converted_at = {}
    for node in ordered_assignments(function):
        name, value = assignment_target(node)
        if name is None or value is None:
            continue
        if is_http_call(value, context):
            http_responses.add(name)
            continue
        if is_raw_container(value, context, web, http_responses):
            raw_containers.add(name)
            continue
        if is_converter_call(value, context):
            converted_at.setdefault(name, node.lineno)
            continue
        if is_direct_untrusted(value, context, web, http_responses, raw_containers, typed_keys):
            tainted.add(name)
            continue
        base = peeled(value)
        if (
            isinstance(base, ast.Name)
            and base.id in tainted
            and converted_at.get(base.id, float("inf")) > node.lineno
        ):
            tainted.add(name)
    return http_responses, raw_containers, tainted, converted_at


def untrusted_label(node, context, web, state, typed_keys):
    http_responses, raw_containers, tainted, converted_at = state
    if is_direct_untrusted(node, context, web, http_responses, raw_containers, typed_keys):
        return ast.unparse(node)
    base = peeled(node)
    if (
        isinstance(base, ast.Name)
        and base.id in tainted
        and converted_at.get(base.id, float("inf")) >= node.lineno
    ):
        return ast.unparse(node)
    return None


def exception_names(expr, context):
    if expr is None:
        return {BASE_EXCEPTION}
    nodes = expr.elts if isinstance(expr, ast.Tuple) else [expr]
    names = set()
    for item in nodes:
        dotted = dotted_name(item, context.aliases)
        if dotted:
            names.add(dotted)
            names.add(dotted.rsplit(".", 1)[-1])
    return names


def in_block(child, statements):
    return any(child is stmt for stmt in statements)


def is_caught(node, needed, context):
    child = node
    current = context.parents.get(id(node))
    while current is not None:
        if isinstance(current, ast.Try) and in_block(child, current.body):
            for handler in current.handlers:
                if exception_names(handler.type, context) & needed:
                    return True
        if isinstance(current, (ast.With, ast.AsyncWith)) and in_block(child, current.body):
            for item in current.items:
                call = item.context_expr
                if isinstance(call, ast.Call) and dotted_name(call.func, context.aliases) in SUPPRESS_NAMES:
                    for arg in call.args:
                        if exception_names(arg, context) & needed:
                            return True
        if isinstance(current, (*FUNCTION_TYPES, ast.Lambda)):
            return False
        child, current = current, context.parents.get(id(current))
    return False


def expr_matches_target(candidate, target_text):
    return ast.unparse(candidate) == target_text


def is_positive_call(test, target_text, allow_digits):
    if not isinstance(test, ast.Call):
        return False
    if isinstance(test.func, ast.Attribute):
        if allow_digits and test.func.attr in DIGIT_CHECKS and not test.args:
            return expr_matches_target(test.func.value, target_text)
        if test.func.attr in REGEX_CHECKS and test.args:
            return any(expr_matches_target(arg, target_text) for arg in test.args)
    if isinstance(test.func, ast.Name) and test.func.id == "isinstance" and test.args:
        return expr_matches_target(test.args[0], target_text)
    return False


def is_positive_check(test, target_text, allow_digits):
    stack = [test]
    while stack:
        current = stack.pop()
        if isinstance(current, ast.BoolOp) and isinstance(current.op, ast.And):
            stack.extend(current.values)
        elif is_positive_call(current, target_text, allow_digits):
            return True
    return False


def is_negative_check(test, target_text, allow_digits):
    stack = [test]
    while stack:
        current = stack.pop()
        if isinstance(current, ast.BoolOp) and isinstance(current.op, ast.Or):
            stack.extend(current.values)
        elif (
            isinstance(current, ast.UnaryOp)
            and isinstance(current.op, ast.Not)
            and is_positive_check(current.operand, target_text, allow_digits)
        ):
            return True
    return False


def block_exits(statements):
    return bool(statements) and isinstance(statements[-1], EXIT_NODES)


def has_early_exit_guard(statement, block, target_text, allow_digits):
    for sibling in block:
        if sibling is statement:
            return False
        if (
            isinstance(sibling, ast.If)
            and block_exits(sibling.body)
            and is_negative_check(sibling.test, target_text, allow_digits)
        ):
            return True
    return False


def enclosing_blocks(node, context):
    blocks = []
    child = node
    current = context.parents.get(id(node))
    while current is not None:
        for attr in ("body", "orelse", "finalbody"):
            stmts = getattr(current, attr, None)
            if isinstance(stmts, list) and in_block(child, stmts):
                blocks.append((child, stmts))
        if isinstance(current, (*FUNCTION_TYPES, ast.Lambda)):
            break
        child, current = current, context.parents.get(id(current))
    return blocks


def is_prechecked(node, target, allow_digits, context):
    target_text = ast.unparse(target)
    child = node
    current = context.parents.get(id(node))
    while current is not None:
        if isinstance(current, ast.If):
            if in_block(child, current.body) and is_positive_check(current.test, target_text, allow_digits):
                return True
            if in_block(child, current.orelse) and is_negative_check(current.test, target_text, allow_digits):
                return True
        elif isinstance(current, ast.IfExp):
            if child is current.body and is_positive_check(current.test, target_text, allow_digits):
                return True
            if child is current.orelse and is_negative_check(current.test, target_text, allow_digits):
                return True
        if isinstance(current, (*FUNCTION_TYPES, ast.Lambda)):
            break
        child, current = current, context.parents.get(id(current))
    return any(
        has_early_exit_guard(stmt, block, target_text, allow_digits)
        for stmt, block in enclosing_blocks(node, context)
    )


def orm_target(call, context):
    found = terminal_call(call, context)
    if found is not None and found[1] in ORM_METHODS:
        return found[0], f"{found[0].name}.{found[1]}", False
    dotted = dotted_name(call.func, context.aliases) or ""
    short = dotted.rsplit(".", 1)[-1]
    if short in ORM_SHORTCUTS and call.args:
        model = model_of_class(call.args[0], context) or queryset_model(call.args[0], context)
        if model is not None:
            return model, f"{short}({model.name}", True
    return None, None, False


def orm_findings(call, context, web, state, typed_keys, graph):
    model, prefix, is_shortcut = orm_target(call, context)
    if model is None or is_caught(call, ORM_EXCEPTIONS, context):
        return []
    found = []
    for kw in call.keywords:
        if not kw.arg:
            continue
        lookup = resolve_lookup(model, kw.arg, graph)
        if lookup.field is None or not lookup.field.type.endswith("UUIDField"):
            continue
        label = untrusted_label(kw.value, context, web, state, typed_keys)
        if label is None or is_prechecked(call, kw.value, False, context):
            continue
        subject = f"{prefix}, {kw.arg}={label})" if is_shortcut else f"{prefix}({kw.arg}={label})"
        found.append(finding(context.path, RULE, subject, call))
    return found


def function_findings(function, context, web, graph):
    decorators = route_decorators(function, context, web)
    route_params, typed_keys = route_text_params(function, context, web, decorators)
    state = collect_state(function, context, web, route_params, typed_keys)
    found = []
    for node in own_nodes(function):
        if not isinstance(node, ast.Call):
            continue
        info = converter_info(node, context)
        if info is not None:
            label, exceptions, allow_digits, arg = info
            source_text = untrusted_label(arg, context, web, state, typed_keys)
            if (
                source_text is not None
                and not is_caught(node, exceptions, context)
                and not is_prechecked(node, arg, allow_digits, context)
            ):
                found.append(finding(context.path, RULE, f"{label}({source_text})", node))
            continue
        if graph.by_key:
            found.extend(orm_findings(node, context, web, state, typed_keys, graph))
    return found


def check(context):
    if exempt(context):
        return []
    web = imports_web(context)
    graph = project_graph(context.project)
    found = []
    for node in ast.walk(context.tree):
        if isinstance(node, FUNCTION_TYPES):
            found.extend(function_findings(node, context, web, graph))
    return found
