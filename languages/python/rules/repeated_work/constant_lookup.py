import ast

from checks.common import dotted_name, finding
from containers.scope import enclosing_function, store_targets
from repeated_work.scope_helpers import (
    innermost_repeat,
    is_constant_expr,
    outer_constant_map,
    short_text,
)

RULE = "constant-lookup-in-loop"
GUARDED = True
URL_KIND = "url"
LOOKUP_KIND = "lookup"
URL_PARSERS = {
    "urllib.parse.urlparse",
    "urllib.parse.urlsplit",
    "urllib3.util.parse_url",
    "urllib3.util.url.parse_url",
    "yarl.URL",
    "httpx.URL",
}
IMPORT_LOOKUPS = {
    "importlib.import_module",
    "importlib.util.find_spec",
}
LOGGER_LOOKUPS = {"logging.getLogger"}
STATIC_LOOKUPS = {
    "zoneinfo.ZoneInfo",
    "pytz.timezone",
    "dateutil.tz.gettz",
    "codecs.lookup",
    "ipaddress.ip_network",
    "ipaddress.ip_address",
    "ipaddress.IPv4Network",
    "ipaddress.IPv6Network",
    "ipaddress.IPv4Address",
    "ipaddress.IPv6Address",
}
IMPORT_MUTATIONS = {"importlib.reload", "importlib.invalidate_caches"}
LOGGING_MUTATIONS = {
    "logging.basicConfig",
    "logging.config.dictConfig",
    "logging.config.fileConfig",
    "logging.disable",
}


def has_constant_arguments(call, constants):
    if not (call.args or call.keywords):
        return False
    if any(isinstance(arg, ast.Starred) for arg in call.args):
        return False
    if any(keyword.arg is None for keyword in call.keywords):
        return False
    values = [*call.args, *(keyword.value for keyword in call.keywords)]
    return all(is_constant_expr(value, constants) for value in values)


def mutates_imports(loop, aliases):
    for node in ast.walk(loop):
        if isinstance(node, ast.Call):
            if (dotted_name(node.func, aliases) or "") in IMPORT_MUTATIONS:
                return True
            if (
                isinstance(node.func, ast.Attribute)
                and dotted_name(node.func.value, aliases) == "sys.modules"
                and node.func.attr in {"pop", "clear", "update", "setdefault"}
            ):
                return True
        for target in store_targets(node):
            if (
                isinstance(target, ast.Subscript)
                and dotted_name(target.value, aliases) == "sys.modules"
            ):
                return True
    return False


def mutates_logging(loop, aliases):
    return any(
        isinstance(node, ast.Call)
        and (dotted_name(node.func, aliases) or "") in LOGGING_MUTATIONS
        for node in ast.walk(loop)
    )


def lookup_kind(call, loop, aliases):
    target = dotted_name(call.func, aliases) or ""
    if target in URL_PARSERS:
        return URL_KIND
    if target in STATIC_LOOKUPS:
        return LOOKUP_KIND
    if target in IMPORT_LOOKUPS and not mutates_imports(loop, aliases):
        return LOOKUP_KIND
    if target in LOGGER_LOOKUPS and not mutates_logging(loop, aliases):
        return LOOKUP_KIND
    return None


def check(context):
    if context.tests:
        return []
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        repeat = innermost_repeat(node, context.parents)
        if repeat is None:
            continue
        kind = lookup_kind(node, repeat, context.aliases)
        if kind is None:
            continue
        function = enclosing_function(node, context.parents)
        constants = outer_constant_map(context.tree, function, repeat)
        if has_constant_arguments(node, constants):
            subject = f"{kind}|{short_text(node)}"
            found.append(finding(context.path, RULE, subject, node))
    return found
