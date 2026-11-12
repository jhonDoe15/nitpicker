import ast

from boundary.type_aliases import alias_statements
from checks.common import dotted_name

PASSES = 3
PERSISTENCE = {
    "sqlalchemy": {
        "Session",
        "AsyncSession",
        "scoped_session",
        "async_scoped_session",
        "sessionmaker",
        "async_sessionmaker",
        "Engine",
        "AsyncEngine",
        "Connection",
        "AsyncConnection",
        "Query",
        "Result",
        "CursorResult",
        "ScalarResult",
    },
    "sqlmodel": {"Session", "AsyncSession"},
    "django": {"QuerySet", "Manager", "BaseManager", "CursorWrapper"},
    "psycopg": {"Connection", "AsyncConnection", "Cursor", "AsyncCursor"},
    "psycopg2": {"connection", "cursor"},
    "asyncpg": {"Connection", "Pool"},
    "sqlite3": {"Connection", "Cursor"},
    "aiosqlite": {"Connection", "Cursor"},
    "pymysql": {"Connection", "Cursor"},
    "MySQLdb": {"Connection", "Cursor"},
    "pymongo": {"MongoClient", "Database", "Collection", "ClientSession", "Cursor"},
    "motor": {"AsyncIOMotorClient", "AsyncIOMotorDatabase", "AsyncIOMotorCollection"},
    "peewee": {"Database", "SqliteDatabase", "PostgresqlDatabase", "MySQLDatabase"},
    "tortoise": {"QuerySet", "BaseDBAsyncClient"},
    "databases": {"Database"},
}
TRANSPORT = {
    "django": {
        "HttpRequest",
        "HttpResponse",
        "HttpResponseBase",
        "JsonResponse",
        "StreamingHttpResponse",
        "WSGIRequest",
        "ASGIRequest",
    },
    "rest_framework": {"Request", "Response"},
    "starlette": {"Request", "Response", "WebSocket", "HTTPConnection", "UploadFile"},
    "fastapi": {"Request", "Response", "WebSocket", "UploadFile"},
    "flask": {"Request", "Response"},
    "werkzeug": {"Request", "Response"},
    "quart": {"Request", "Response", "Websocket"},
    "aiohttp": {"Request", "BaseRequest", "Response", "StreamResponse"},
    "litestar": {"Request", "Response", "WebSocket"},
    "sanic": {"Request", "HTTPResponse"},
}
RESPONSE_WORD = "Response"
NOT_INBOUND = ("Client", "Error", "Exception")
ALIAS_VALUES = (ast.Subscript, ast.Name, ast.Attribute, ast.BinOp, ast.Constant)
TABLES = (("persistence", PERSISTENCE), ("transport", TRANSPORT))


def kind_of(dotted):
    if not dotted or "." not in dotted:
        return None
    root, name = dotted.split(".")[0], dotted.rsplit(".", 1)[-1]
    for kind, table in TABLES:
        if name in table.get(root, ()):
            return kind
    return "transport" if is_response_type(root, name) else None


def is_response_type(root, name):
    named = RESPONSE_WORD in name and not any(word in name for word in NOT_INBOUND)
    return named and root in TRANSPORT


def located_key(name, context):
    located = context.project.locate(name) if "." in name else None
    return located if located else (context.path, name)


def reference_of(node, context, aliases):
    name = dotted_name(node, context.aliases) or ""
    kind = kind_of(name)
    if kind is not None:
        return kind, name
    return aliases.get(located_key(name, context))


def parsed_string(text):
    try:
        return ast.parse(text.strip(), mode="eval").body
    except SyntaxError:
        return None


def references_in(expression, context, aliases):
    for node in ast.walk(expression):
        if isinstance(node, (ast.Name, ast.Attribute)):
            found = reference_of(node, context, aliases)
            if found is not None:
                yield found
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            parsed = parsed_string(node.value)
            yield from references_in(parsed, context, aliases) if parsed else ()


def add_aliases(path, context, found):
    for name, value in alias_statements(context.tree):
        if isinstance(value, ALIAS_VALUES) and (path, name) not in found:
            first = next(references_in(value, context, found), None)
            if first is not None:
                found[(path, name)] = first


def infrastructure_aliases(project):
    def build(_):
        found = {}
        for _ in range(PASSES):
            for path, context in project.contexts.items():
                add_aliases(path, context, found)
        return found

    return project.memo("infrastructure-aliases", build)


def infrastructure_in(annotation, context):
    aliases = infrastructure_aliases(context.project)
    return list(dict.fromkeys(references_in(annotation, context, aliases)))
