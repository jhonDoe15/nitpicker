import ast
import builtins
import json

JSON_ERRORS = {
    "json.JSONDecodeError": json.JSONDecodeError,
    "json.decoder.JSONDecodeError": json.JSONDecodeError,
}
JSON_CALLS = {"json.loads", "json.load"}
WRAPPER_OWNERS = ("request", "response", "resp", "req")
JSON_ENTRY = (("ValueError",), ("ValueError", "UnicodeError"))
TIMEDELTA_ENTRY = (("OverflowError",), ("ValueError", "TypeError", "OverflowError"))


def known_class(dotted):
    if dotted in JSON_ERRORS:
        return JSON_ERRORS[dotted]
    candidate = getattr(builtins, dotted, None) if "." not in dotted else None
    if isinstance(candidate, type) and issubclass(candidate, BaseException):
        return candidate
    return None


def has_variable_argument(call):
    values = list(call.args) + [keyword.value for keyword in call.keywords]
    return any(not isinstance(value, ast.Constant) for value in values)


def is_json_wrapper(call):
    func = call.func
    if not isinstance(func, ast.Attribute) or func.attr != "json" or call.args:
        return False
    owner = func.value
    if isinstance(owner, ast.Await):
        owner = owner.value
    name = owner.id if isinstance(owner, ast.Name) else getattr(owner, "attr", "")
    return name.lower().endswith(WRAPPER_OWNERS)


def entry_of(call, dotted):
    if dotted in JSON_CALLS or is_json_wrapper(call):
        return JSON_ENTRY
    if dotted == "datetime.timedelta" and has_variable_argument(call):
        return TIMEDELTA_ENTRY
    return None
