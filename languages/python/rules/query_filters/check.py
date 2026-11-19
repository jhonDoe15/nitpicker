import ast

from checks.common import finding
from query_filters.segments import interpolations, rendered, segments_of
from query_filters.shapes import (
    has_ldap_shape,
    has_scim_shape,
    is_ldap_value,
    is_scim_value,
)
from query_filters.sinks import candidate_strings, imports_ldap
from query_filters.values import depends_on_input
from regexes.patterns import enclosing_function

GUARDED = True
RULE = "filter-unescaped-value"
LDAP = "ldap"
SCIM = "scim"


def dialect_of(text, context):
    if has_ldap_shape(text):
        return (LDAP, is_ldap_value) if imports_ldap(context) else (None, None)
    if has_scim_shape(text):
        return SCIM, is_scim_value
    return None, None


def unescaped_value(node, context):
    segments = segments_of(node)
    function = enclosing_function(node, context)
    if segments is None or function is None:
        return None
    kind, is_value = dialect_of(rendered(segments), context)
    for before, value in interpolations(segments):
        if not (kind and is_value(before)):
            continue
        if depends_on_input(value, function, context.aliases):
            return kind, value
    return None


def check(context):
    if context.tests:
        return []
    found = []
    for node in candidate_strings(context):
        problem = unescaped_value(node, context)
        if problem is not None:
            kind, value = problem
            subject = f"{kind}|{ast.unparse(value)}"
            found.append(finding(context.path, RULE, subject, node))
    return found
