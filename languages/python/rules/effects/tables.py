DATABASE = "database"
REMOTE = "remote"
MESSAGE = "message"
WRITE = "database-write"
UNSAFE_STRIPE = "unsafe-payment"
UNSAFE_MESSAGE = "unsafe-message"
UNSAFE_SQL = "unsafe-insert"
UNSAFE_KINDS = {
    UNSAFE_STRIPE: "payment",
    UNSAFE_MESSAGE: "message",
    UNSAFE_SQL: "insert",
}
PRIORITY = (DATABASE, REMOTE, MESSAGE)

MODULE_KINDS = {
    "requests": REMOTE,
    "httpx": REMOTE,
    "aiohttp": REMOTE,
    "urllib3": REMOTE,
    "urllib.request": REMOTE,
    "http.client": REMOTE,
    "boto3": REMOTE,
    "aioboto3": REMOTE,
    "grpc": REMOTE,
    "sqlite3": DATABASE,
    "aiosqlite": DATABASE,
    "psycopg": DATABASE,
    "psycopg2": DATABASE,
    "pymysql": DATABASE,
    "aiomysql": DATABASE,
    "mysql.connector": DATABASE,
    "asyncpg": DATABASE,
    "pymongo": DATABASE,
    "motor": DATABASE,
    "redis": DATABASE,
}
MESSAGE_MODULES = {
    "kafka": {"send"},
    "aiokafka": {"send", "send_and_wait", "send_batch"},
    "confluent_kafka": {"produce"},
    "pika": {"basic_publish"},
    "aio_pika": {"publish"},
    "nats": {"publish"},
    "google.cloud.pubsub_v1": {"publish"},
    "google.cloud.pubsub": {"publish"},
    "boto3": {"send_message", "send_message_batch", "publish", "publish_batch"},
    "aioboto3": {"send_message", "send_message_batch", "publish", "publish_batch"},
}
GENERIC_MESSAGE_METHODS = {"send", "publish"}
PRODUCER_WORDS = {
    "producer",
    "publisher",
    "exchange",
    "topic",
    "sns",
    "sqs",
    "nc",
    "js",
    "jetstream",
    "nats",
    "kafka",
    "queue",
    "channel",
    "client",
    "bus",
    "broker",
    "pubsub",
    "mq",
    "rabbit",
}
OWNER_KINDS = {
    "repo": DATABASE,
    "repository": DATABASE,
    "dao": DATABASE,
    "db": DATABASE,
    "database": DATABASE,
    "session": DATABASE,
    "cursor": DATABASE,
    "conn": DATABASE,
    "connection": DATABASE,
    "pool": DATABASE,
    "objects": DATABASE,
    "collection": DATABASE,
    "redis": DATABASE,
    "client": REMOTE,
    "http": REMOTE,
    "api": REMOTE,
    "gateway": REMOTE,
}
METHOD_PREFIXES = {
    "find",
    "fetch",
    "load",
    "read",
    "query",
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "remove",
    "save",
    "create",
    "count",
    "execute",
    "executemany",
    "write",
    "list",
}
GETTER_LOOKUPS = {"by", "all", "many", "one", "page"}
METHOD_NAMES = {
    "exists",
    "send",
    "post",
    "put",
    "patch",
    "request",
    "raw",
    "run",
    "filter",
    "first",
    "all",
    "one",
    "one_or_none",
    "scalar",
    "scalars",
    "commit",
    "refresh",
    "get_or_create",
    "update_or_create",
    "bulk_create",
    "bulk_update",
}
DJANGO_ASYNC = {
    "aget",
    "acreate",
    "acount",
    "afirst",
    "alast",
    "aexists",
    "aupdate",
    "adelete",
    "aget_or_create",
    "aupdate_or_create",
    "abulk_create",
    "abulk_update",
    "ain_bulk",
    "aiterator",
    "aaggregate",
    "acontains",
    "aearliest",
    "alatest",
}
METHOD_NAMES |= DJANGO_ASYNC
PARTIALS = {"functools.partial", "partial"}
TASK_DECORATORS = {"celery.shared_task", "celery.task"}
TASK_METHODS = {"delay", "apply_async"}
BOTO_FACTORIES = {
    "boto3.client",
    "boto3.resource",
    "aioboto3.client",
    "aioboto3.resource",
}
BOTO_SERVICES = {
    "dynamodb": (DATABASE, {}),
    "sqs": (REMOTE, {"send_message": MESSAGE, "send_message_batch": MESSAGE}),
    "sns": (REMOTE, {"publish": MESSAGE, "publish_batch": MESSAGE}),
}
