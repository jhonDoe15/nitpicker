import ast

from checks.common import dotted_name
from regexes.patterns import is_text

LDAP_ROOTS = ("ldap", "ldap3", "django_auth_ldap", "ldap_sync")
SEARCH_METHODS = {
    "search": 1,
    "search_s": 2,
    "search_st": 2,
    "search_ext": 2,
    "search_ext_s": 2,
    "paged_search": 1,
}
FILTER_KEYWORDS = {"search_filter", "filterstr", "filter"}
FILTER_NAMES = {"search_filter", "filterstr", "ldap_filter", "scim_filter", "filter"}
FILTER_KEY = "filter"
REGEX_MODULES = {"re", "regex"}


def imports_ldap(context):
    return any(
        value.split(".")[0] in LDAP_ROOTS
        for table in context.aliases[:2]
        for value in table.values()
    )


def target_name(node):
    if isinstance(node, ast.Name):
        return node.id
    return node.attr if isinstance(node, ast.Attribute) else None


def is_regex_call(call, aliases):
    name = dotted_name(call.func, aliases) or ""
    return name.split(".")[0] in REGEX_MODULES and "." in name


def call_candidates(call, aliases):
    if is_regex_call(call, aliases):
        return []
    method = call.func.attr if isinstance(call.func, ast.Attribute) else None
    found = [k.value for k in call.keywords if k.arg in FILTER_KEYWORDS]
    index = SEARCH_METHODS.get(method)
    if index is not None and len(call.args) > index:
        found.append(call.args[index])
    return found


def assignment_candidates(node):
    if isinstance(node, ast.Assign):
        names = {target_name(target) for target in node.targets}
        return [node.value] if names & FILTER_NAMES else []
    if isinstance(node, ast.Dict):
        return [
            value
            for key, value in zip(node.keys, node.values)
            if is_text(key) and key.value == FILTER_KEY
        ]
    return []


def candidate_strings(context):
    found = {}
    for node in ast.walk(context.tree):
        values = assignment_candidates(node)
        if isinstance(node, ast.Call):
            values = values + call_candidates(node, context.aliases)
        for value in values:
            found[id(value)] = value
    return sorted(found.values(), key=lambda node: node.lineno)
