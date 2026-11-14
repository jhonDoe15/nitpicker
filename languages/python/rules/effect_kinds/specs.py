import ast
from collections import namedtuple

from checks.common import dotted_name
from effect_kinds.tables import (
    DATABASE,
    MESSAGE,
    REMOTE,
)
from index.clients import BOTO_FACTORIES, BOTO_SERVICES
from security.sql.sinks import DOTTED_SINKS

Spec = namedtuple("Spec", "default methods named")
UNBOUND = Spec(None, {"": None}, False)
DERIVING = {"cursor", "Table", "channel", "acquire"}
VALUE_MODULES = {"exceptions", "auth", "fields", "extras", "types", "models"}
DERIVE_PASSES = 2
BOTO_ROOTS = ("boto3", "aioboto3")
HTTP_CLIENTS = (
    "requests.Session",
    "requests.session",
    "httpx.Client",
    "httpx.AsyncClient",
    "aiohttp.ClientSession",
    "urllib3.PoolManager",
)
STORE_CLIENTS = (
    "sqlite3.connect",
    "psycopg.connect",
    "psycopg2.connect",
    "pymysql.connect",
    "asyncpg.connect",
    "asyncpg.create_pool",
    "redis.Redis",
    "redis.from_url",
    "redis.asyncio.Redis",
    "redis.asyncio.from_url",
    "pymongo.MongoClient",
    "aiosqlite.connect",
    "motor.motor_asyncio.AsyncIOMotorClient",
)


def plain(kind):
    return Spec(kind, {}, False)


def orm(kind):
    return Spec(kind, {}, True)


def producer(*methods):
    return Spec(None, {method: MESSAGE for method in methods}, False)


CONSTRUCTORS = {
    *HTTP_CLIENTS,
    *BOTO_FACTORIES,
    "redis.Redis",
    "redis.asyncio.Redis",
    "redis.from_url",
    "redis.asyncio.from_url",
    "pymongo.MongoClient",
    "motor.motor_asyncio.AsyncIOMotorClient",
    "sqlalchemy.orm.Session",
    "sqlalchemy.ext.asyncio.AsyncSession",
    "kafka.KafkaProducer",
    "aiokafka.AIOKafkaProducer",
    "confluent_kafka.Producer",
    "google.cloud.pubsub_v1.PublisherClient",
    "google.cloud.pubsub.PublisherClient",
    "celery.Celery",
}
FACTORIES = {
    **{name: plain(REMOTE) for name in HTTP_CLIENTS},
    **{name: plain(DATABASE) for name in STORE_CLIENTS},
    "sqlalchemy.orm.Session": orm(DATABASE),
    "sqlalchemy.ext.asyncio.AsyncSession": orm(DATABASE),
    "kafka.KafkaProducer": producer("send"),
    "aiokafka.AIOKafkaProducer": producer("send", "send_and_wait", "send_batch"),
    "confluent_kafka.Producer": producer("produce"),
    "google.cloud.pubsub_v1.PublisherClient": producer("publish"),
    "google.cloud.pubsub.PublisherClient": producer("publish"),
    "celery.Celery": producer("send_task"),
}
CLIENT_OBJECTS = {"celery.current_app": producer("send_task")}
BUFFERS = {
    "pipeline": Spec(None, {"execute": DATABASE}, False),
    "batch_writer": Spec(None, {}, False),
}
CONFLICT = Spec(None, {}, False)
SESSION_HELPERS = {
    "close",
    "aclose",
    "mount",
    "build_request",
    "prepare_request",
    "get_adapter",
    "merge_environment_settings",
    "set_cookie",
}
NO_KIND_METHODS = DERIVING | set(BUFFERS) | SESSION_HELPERS
HTTP_MODULES = {
    "requests": None,
    "httpx": None,
    "aiohttp": None,
    "urllib3": None,
    "urllib.request": None,
    "http.client": None,
}
REMOTE_OPERATIONS = {
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options",
    "request",
    "send",
    "stream",
    "urlopen",
    "urlretrieve",
}
SELF_PREFIXES = ("self.", "cls.")
ENTRY_POINTS = set(DOTTED_SINKS)


def is_operation(path, kind):
    if kind != REMOTE or matching_key(path, HTTP_MODULES) is None:
        return True
    return path.split(".")[-1] in REMOTE_OPERATIONS


def holds_entry(path):
    return any(entry.startswith(f"{path}.") for entry in ENTRY_POINTS)


def is_value_path(path):
    if path in ENTRY_POINTS:
        return False
    parts = path.split(".")
    return parts[-1][:1].isupper() or any(part in VALUE_MODULES for part in parts[1:])


def bound_value(node):
    return node.value if isinstance(node, ast.Await) else node


def call_name_of(value, aliases):
    value = bound_value(value)
    return dotted_name(value.func, aliases) if isinstance(value, ast.Call) else None


def service_spec(call):
    first = call.args[0] if call.args else None
    service = first.value if isinstance(first, ast.Constant) else None
    default, methods = BOTO_SERVICES.get(service, (REMOTE, {}))
    return Spec(default, methods, False)


def is_boto_client(call, name, imports_boto):
    if name in BOTO_FACTORIES:
        return True
    function = call.func
    return (
        imports_boto
        and isinstance(function, ast.Attribute)
        and function.attr in {"client", "resource"}
        and bool(call.args)
        and isinstance(call.args[0], ast.Constant)
    )


def client_key(node):
    if isinstance(node, ast.Call):
        node = node.func
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        return f"{node.value.id}.{node.attr}"
    return None


def receiver_spec(node, aliases, imports_boto, known):
    node = bound_value(node)
    if isinstance(node, ast.Call):
        return spec_of_value(node, aliases, imports_boto, known)
    if isinstance(node, (ast.Subscript, ast.Attribute)):
        inner = receiver_spec(node.value, aliases, imports_boto, known)
        return inner if inner is not None and inner.default == DATABASE else None
    return known(client_key(node))


def spec_of_value(value, aliases, imports_boto, known):
    value = bound_value(value)
    if isinstance(value, (ast.Subscript, ast.Attribute)):
        return receiver_spec(value, aliases, imports_boto, known)
    if not isinstance(value, ast.Call):
        return None
    name = dotted_name(value.func, aliases)
    if is_boto_client(value, name, imports_boto):
        return service_spec(value)
    if name in FACTORIES:
        return FACTORIES[name]
    function = value.func
    if isinstance(function, ast.Attribute) and function.attr in BUFFERS:
        return BUFFERS[function.attr]
    if isinstance(function, ast.Attribute) and function.attr in DERIVING:
        return receiver_spec(function.value, aliases, imports_boto, known)
    return None


def matching_key(name, table):
    matches = [key for key in table if name == key or name.startswith(f"{key}.")]
    return max(matches, key=len) if matches else None
