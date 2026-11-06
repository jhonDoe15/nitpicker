import ast

from checks.common import dotted_name, finding, string_value
from security.resolve.booleans import can_be_true
from security.resolve.calls import keyword
from security.resolve.scopes import where_of
from security.support import exempt

RULE = "orm-query-logging"
GUARDED = True
ENGINE_FACTORIES = {"create_engine", "create_async_engine", "engine_from_config"}
ENGINE_ROOTS = ("sqlalchemy.", "sqlmodel.")
ECHO = "echo"
ECHO_DEBUG = "debug"
FLASK_ECHO = "SQLALCHEMY_ECHO"
ENGINE_OPTIONS = "engine_options"
INFO_LOGGERS = {"sqlalchemy", "sqlalchemy.engine", "sqlalchemy.engine.Engine"}
DEBUG_LOGGERS = {"peewee", "tortoise.db_client", "django.db.backends"}
LEVELS = {"DEBUG": 10, "INFO": 20}
SET_LEVEL = "setLevel"
GET_LOGGER = "getLogger"


def level_of(node):
    if isinstance(node, ast.IfExp):
        levels = [level_of(node.body), level_of(node.orelse)]
        known = [level for level in levels if level is not None]
        return min(known) if known else None
    if isinstance(node, ast.Attribute):
        return LEVELS.get(node.attr)
    if isinstance(node, ast.Name):
        return LEVELS.get(node.id)
    text = string_value(node)
    if text is not None:
        return LEVELS.get(text.upper())
    if isinstance(node, ast.Constant) and type(node.value) is int:
        return node.value if node.value > 0 else None
    return None


def logs_queries(logger, level):
    if level is None:
        return False
    if logger in INFO_LOGGERS:
        return level <= LEVELS["INFO"]
    return logger in DEBUG_LOGGERS and level <= LEVELS["DEBUG"]


def echo_on(value, node, context):
    return string_value(value) == ECHO_DEBUG or can_be_true(
        value, where_of(node, context)
    )


def engine_echo(call, context):
    name = dotted_name(call.func, context.aliases) or ""
    if (
        not name.startswith(ENGINE_ROOTS)
        or name.rsplit(".", 1)[-1] not in ENGINE_FACTORIES
    ):
        return None
    value = keyword(call, ECHO)
    on = value is not None and echo_on(value, call, context)
    return f"{name.rsplit('.', 1)[-1]}(echo=...)" if on else None


def engine_options_echo(call, context):
    options = keyword(call, ENGINE_OPTIONS)
    if not isinstance(options, ast.Dict):
        return None
    for key, value in zip(options.keys, options.values):
        if string_value(key) == ECHO and echo_on(value, call, context):
            return "engine_options echo"
    return None


def flask_echo(call, context):
    value = keyword(call, FLASK_ECHO)
    return (
        FLASK_ECHO
        if value is not None and can_be_true(value, where_of(call, context))
        else None
    )


def logger_level(call, context):
    if not isinstance(call.func, ast.Attribute) or call.func.attr != SET_LEVEL:
        return None
    owner = call.func.value
    getter = (
        dotted_name(owner.func, context.aliases)
        if isinstance(owner, ast.Call)
        else None
    )
    if not (getter or "").endswith(GET_LOGGER) or not owner.args or not call.args:
        return None
    logger = string_value(owner.args[0])
    return f"{logger} logger" if logs_queries(logger, level_of(call.args[0])) else None


def call_subject(call, context):
    checks = (engine_echo, engine_options_echo, flask_echo, logger_level)
    return next((s for s in (check(call, context) for check in checks) if s), None)


def target_name(target):
    if isinstance(target, ast.Subscript):
        return string_value(target.slice)
    if isinstance(target, ast.Attribute):
        return target.attr
    return target.id if isinstance(target, ast.Name) else None


def assigned_subject(node, context):
    targets = node.targets if isinstance(node, ast.Assign) else [node.target]
    named = any(target_name(target) == FLASK_ECHO for target in targets)
    on = node.value is not None and can_be_true(node.value, where_of(node, context))
    return FLASK_ECHO if named and on else None


def dict_level(value):
    if not isinstance(value, ast.Dict):
        return None
    for key, entry in zip(value.keys, value.values):
        if string_value(key) == "level":
            return level_of(entry)
    return None


def config_subjects(node, context):
    found = []
    for key, value in zip(node.keys, node.values):
        name = string_value(key)
        if name == FLASK_ECHO and can_be_true(value, where_of(node, context)):
            found.append(FLASK_ECHO)
        elif name is not None and logs_queries(name, dict_level(value)):
            found.append(f"{name} logger")
    return found


def node_subjects(node, context):
    if isinstance(node, ast.Call):
        subject = call_subject(node, context)
        return [subject] if subject else []
    if isinstance(node, (ast.Assign, ast.AnnAssign)):
        subject = assigned_subject(node, context)
        return [subject] if subject else []
    return config_subjects(node, context) if isinstance(node, ast.Dict) else []


def check(context):
    if exempt(context):
        return []
    return [
        finding(context.path, RULE, subject, node)
        for node in ast.walk(context.tree)
        for subject in node_subjects(node, context)
    ]
