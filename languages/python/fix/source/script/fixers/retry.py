import ast
import re

from checks.common import last_name
from fixers.call_edits import has_spread
from source_text import refuse, replacement

FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
AT_SIGN = re.compile(r"[ \t]*@[ \t]*")


def is_fixture(owner):
    for decorator in owner.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        if last_name(target) == "fixture":
            return True
    return False


def passes_more_than_once(node):
    if not isinstance(node, ast.Call):
        return False
    given = [keyword.value for keyword in node.keywords if keyword.arg == "min_passes"]
    given.extend(node.args[1:2])
    return any(
        not isinstance(value, ast.Constant) or value.value != 1 for value in given
    )


def retry_decorator(source, node, context):
    owner = context.parents.get(id(node))
    if (
        not isinstance(owner, FUNCTIONS)
        or node not in owner.decorator_list
        or not owner.name.startswith("test")
        or is_fixture(owner)
    ):
        refuse("the retry is not a decorator of a test function")
    if passes_more_than_once(node):
        refuse("the decorator requires more than one passing run")
    if isinstance(node, ast.Call) and has_spread(node):
        refuse("the decorator spreads its arguments, so what it sets is unknown")
    start, end = source.span(node)
    first = source.starts[node.lineno - 1]
    if not AT_SIGN.fullmatch(source.text[first:start]):
        refuse("the decorator shares its line with other code")
    last = node.end_lineno
    tail = source.text[end : source.starts[last - 1] + len(source.lines[last - 1])].strip()
    if tail and not tail.startswith("#"):
        refuse("the decorator shares its line with other code")
    stop = source.starts[last] if last < len(source.starts) else len(source.text)
    return [replacement(first, stop, "")]
