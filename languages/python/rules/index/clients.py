DATABASE = "database"
REMOTE = "remote"
MESSAGE = "message"
ANY_METHOD = None

HTTP_METHODS = {
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
}
HTTP_CLIENT_FACTORIES = {
    "requests.Session",
    "requests.session",
    "requests.sessions.Session",
    "httpx.Client",
    "httpx.AsyncClient",
    "aiohttp.ClientSession",
    "aiohttp.client.ClientSession",
}
POOL_FACTORIES = {"urllib3.PoolManager"}
BOTO_FACTORIES = {
    "boto3.client",
    "boto3.resource",
    "aioboto3.client",
    "aioboto3.resource",
}
REDIS_FACTORIES = {
    "redis.Redis",
    "redis.StrictRedis",
    "redis.asyncio.Redis",
    "redis.from_url",
}
DATABASE_FACTORIES = {
    "sqlite3.connect",
    "psycopg.connect",
    "psycopg2.connect",
    "pymysql.connect",
    "asyncpg.connect",
    "asyncpg.create_pool",
    "pymongo.MongoClient",
}
CLIENTS = {
    **{name: (REMOTE, HTTP_METHODS, False) for name in HTTP_CLIENT_FACTORIES},
    **{name: (REMOTE, {"request", "urlopen"}, False) for name in POOL_FACTORIES},
    **{name: (REMOTE, ANY_METHOD, False) for name in BOTO_FACTORIES},
    **{name: (MESSAGE, {"publish"}, False) for name in REDIS_FACTORIES},
    "openai.OpenAI": (REMOTE, {"create", "parse"}, True),
    "openai.AsyncOpenAI": (REMOTE, {"create", "parse"}, True),
    "anthropic.Anthropic": (REMOTE, {"create"}, True),
    "anthropic.AsyncAnthropic": (REMOTE, {"create"}, True),
    "kafka.KafkaProducer": (MESSAGE, {"send"}, False),
    "aiokafka.AIOKafkaProducer": (MESSAGE, {"send", "send_and_wait"}, False),
    "confluent_kafka.Producer": (MESSAGE, {"produce"}, False),
    "pika.BlockingConnection": (MESSAGE, {"basic_publish"}, False),
    "aio_pika.connect": (MESSAGE, {"publish"}, True),
    "aio_pika.connect_robust": (MESSAGE, {"publish"}, True),
    "nats.connect": (MESSAGE, {"publish"}, False),
    "google.cloud.pubsub_v1.PublisherClient": (MESSAGE, {"publish"}, False),
    "paho.mqtt.client.Client": (MESSAGE, {"publish"}, False),
}
PER_ITEM_CLIENT_FACTORIES = (
    HTTP_CLIENT_FACTORIES
    | POOL_FACTORIES
    | BOTO_FACTORIES
    | REDIS_FACTORIES
    | DATABASE_FACTORIES
)
HTTP_FUNCTIONS = ("get", "post", "put", "patch", "delete", "head", "options", "request")
DIRECT_CALLS = {
    **{
        f"{module}.{method}": REMOTE
        for module in ("requests", "httpx")
        for method in HTTP_FUNCTIONS
    },
    "httpx.stream": REMOTE,
    "aiohttp.request": REMOTE,
    "urllib.request.urlopen": REMOTE,
    "urllib3.request": REMOTE,
}
BOTO_SERVICES = {
    "dynamodb": (DATABASE, {}),
    "sqs": (REMOTE, {"send_message": MESSAGE, "send_message_batch": MESSAGE}),
    "sns": (REMOTE, {"publish": MESSAGE, "publish_batch": MESSAGE}),
    "events": (REMOTE, {"put_events": MESSAGE}),
    "kinesis": (REMOTE, {"put_record": MESSAGE, "put_records": MESSAGE}),
    "firehose": (REMOTE, {"put_record": MESSAGE, "put_record_batch": MESSAGE}),
}
LIMITER_FACTORIES = {
    "asyncio.Semaphore",
    "asyncio.BoundedSemaphore",
    "asyncio.Lock",
    "anyio.Semaphore",
    "anyio.CapacityLimiter",
    "anyio.Lock",
    "trio.CapacityLimiter",
    "trio.Semaphore",
    "trio.Lock",
    "aiolimiter.AsyncLimiter",
    "asyncio_throttle.Throttler",
    "aiometer.Throttler",
}
