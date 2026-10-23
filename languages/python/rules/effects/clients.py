import ast
from collections import namedtuple

from checks.common import dotted_name
from effects.tables import (
    BOTO_FACTORIES,
    BOTO_SERVICES,
    DATABASE,
    MESSAGE,
    MESSAGE_MODULES,
    MODULE_KINDS,
    PARTIALS,
    REMOTE,
    TASK_DECORATORS,
)
from security.sql.sinks import DOTTED_SINKS

Spec = namedtuple("Spec", "default methods named")
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
NO_KIND_METHODS = DERIVING | set(BUFFERS)
ENTRY_POINTS = set(DOTTED_SINKS)


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


def spec_of_value(value, aliases, imports_boto, known):
    value = bound_value(value)
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
        return known.get(client_key(function.value))
    return None


def target_key(target):
    if isinstance(target, ast.Name):
        return target.id
    if isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name):
        if target.value.id in {"self", "cls"}:
            return f"{target.value.id}.{target.attr}"
    return None


def binding_pairs(node):
    if isinstance(node, ast.Assign):
        return [(t, node.value) for t in node.targets]
    if isinstance(node, ast.AnnAssign) and node.value is not None:
        return [(node.target, node.value)]
    if isinstance(node, (ast.With, ast.AsyncWith)):
        return [(i.optional_vars, i.context_expr) for i in node.items]
    return []


def imported_module_paths(tree):
    paths = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            paths.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            paths.append(node.module)
            paths.extend(f"{node.module}.{alias.name}" for alias in node.names)
    return paths


def matching_key(name, table):
    matches = [key for key in table if name == key or name.startswith(f"{key}.")]
    return max(matches, key=len) if matches else None


def static_names(context, paths):
    aliases = context.aliases
    imports_boto = any(matching_key(path, dict.fromkeys(BOTO_ROOTS)) for path in paths)
    clients, partials = {}, {}
    pairs = [
        (target_key(target), value)
        for node in ast.walk(context.tree)
        for target, value in binding_pairs(node)
        if target is not None and target_key(target) is not None
    ]
    for _ in range(DERIVE_PASSES):
        for key, value in pairs:
            spec = spec_of_value(value, aliases, imports_boto, clients)
            if spec is not None:
                clients[key] = spec
            elif call_name_of(value, aliases) in PARTIALS and bound_value(value).args:
                partials[key] = bound_value(value).args[0]
    return clients, partials


def imported_kinds(tree):
    kinds = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                add_module_kind(kinds, alias)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            add_from_kind(kinds, node)
    return kinds


def add_module_kind(kinds, alias):
    key = matching_key(alias.name, MODULE_KINDS)
    if key is None:
        return
    if alias.asname:
        kinds[alias.asname] = (MODULE_KINDS[key], ())
        return
    root = alias.name.split(".")[0]
    previous = kinds.get(root)
    if previous is None or previous[1]:
        kinds[root] = (MODULE_KINDS[key], tuple(key.split(".")[1:]))


def add_from_kind(kinds, node):
    module_key = matching_key(node.module, MODULE_KINDS)
    for alias in node.names:
        path = f"{node.module}.{alias.name}"
        key = module_key or matching_key(path, MODULE_KINDS)
        if key is not None and (not is_value_path(path) or holds_entry(path)):
            kinds[alias.asname or alias.name] = (MODULE_KINDS[key], ())


def message_methods(paths):
    methods = set()
    for path in paths:
        key = matching_key(path, MESSAGE_MODULES)
        if key is not None:
            methods |= MESSAGE_MODULES[key]
    return methods


def is_task_decorator(decorator, context):
    node = decorator.func if isinstance(decorator, ast.Call) else decorator
    name = dotted_name(node, context.aliases) or ""
    return name in TASK_DECORATORS or name.endswith(".task") or name == "task"


def imports_celery(context):
    return any(
        value.startswith("celery")
        for table in context.aliases[:2]
        for value in table.values()
    )


def task_names(project):
    def build(_):
        found = set()
        for context in project.contexts.values():
            if not imports_celery(context):
                continue
            for node in ast.walk(context.tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    if any(is_task_decorator(d, context) for d in node.decorator_list):
                        found.add(node.name)
        return found

    return project.memo("celery-tasks", build)
