import ast
import re

from checks.common import dotted_name, finding
from security.resolve.scopes import where_of
from security.sql.pieces import Pieces
from security.sql.sinks import (
    RAW_BUILDERS,
    RAW_KEYWORDS,
    build_wrappers,
    query_arguments,
    sink_of,
)
from security.support import exempt

RULE = "sql-string-formatting"
OBJECTS = r"(?:table|index|view|database|schema|sequence|trigger|function|type|materialized\s+view)"
STATEMENT = re.compile(
    r"\b(?:select\s.+?\sfrom\s|delete\s+from\s|(?:insert|replace)\s.+?\svalues\b"
    r"|update\s.+?\sset\s|merge\s+into\s|truncate\s+table\b"
    rf"|drop\s+{OBJECTS}\b|alter\s+(?:table|index|view|database|schema|sequence)\b"
    rf"|create\s+(?:or\s+replace\s+)?(?:unique\s+)?(?:temp(?:orary)?\s+)?{OBJECTS}\b"
    r"|with\s+\w+\s+as\s*\()",
    re.I | re.S,
)
UPPER_KEYWORD = re.compile(
    r"\b(?:SELECT|INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|FROM|WHERE|SET"
    r"|VALUES|JOIN|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|RETURNING)\b"
)
COMPARISON = r"\s*(?:=|<>|!=|<=|>=|<|>|\blike\b|\bilike\b|\bin\b|\bnot\s+in\b|\bis\b|\bbetween\b)"
CLAUSE = re.compile(
    rf"\b(?:where|and|or|having|on)\s+[\w.\"`\[\]]+{COMPARISON}|\b(?:order|group)\s+by\s"
    r"|\b(?:limit|offset)\s+(?:\d|%s|\?|:\w|\$\d)|\breturning\s|\bvalues\s*\(",
    re.I,
)


def is_sql(text):
    return bool(
        STATEMENT.search(text) or UPPER_KEYWORD.search(text) or CLAUSE.search(text)
    )


def composed_raw(call, context):
    function = call.func
    if not (isinstance(function, ast.Attribute) and function.attr == "format"):
        return []
    receiver = getattr(function.value, "func", None)
    if dotted_name(receiver, context.aliases) not in RAW_BUILDERS:
        return []
    return [
        argument
        for argument in call.args
        if isinstance(argument, ast.Call)
        and dotted_name(argument.func, context.aliases) in RAW_BUILDERS
    ]


def raw_findings(node, context, pieces):
    found = []
    for raw in composed_raw(node, context):
        arguments = query_arguments(raw, keywords=RAW_KEYWORDS)
        where = where_of(raw, context)
        if any(pieces.of(value, where)[1] for value in arguments):
            subject = dotted_name(raw.func, context.aliases)
            found.append(finding(context.path, RULE, subject, raw))
    return found


def check(context):
    if exempt(context):
        return []
    wrappers = context.project.memo("sql-wrappers", build_wrappers)
    pieces = Pieces()
    found = []
    for node in ast.walk(context.tree):
        if not isinstance(node, ast.Call):
            continue
        found.extend(raw_findings(node, context, pieces))
        sink = sink_of(node, context, wrappers)
        if sink is None:
            continue
        subject, raw, arguments = sink
        where = where_of(node, context)
        for value in arguments:
            text, unsafe, built = pieces.of(value, where)
            if built and unsafe and (raw or is_sql(text)):
                found.append(finding(context.path, RULE, subject, node))
                break
    return found
