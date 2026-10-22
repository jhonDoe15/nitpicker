import ast
from collections import namedtuple

from checks.common import dotted_name

Origin = namedtuple("Origin", "factory call")
DATABASE = "database"
REMOTE = "remote"
MESSAGE = "message"

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
ANY_METHOD = None
BOTO_FACTORIES = {
    "boto3.client",
    "boto3.resource",
    "aioboto3.client",
    "aioboto3.resource",
}
CLIENTS = {
    "requests.Session": (REMOTE, HTTP_METHODS, False),
    "requests.session": (REMOTE, HTTP_METHODS, False),
    "requests.sessions.Session": (REMOTE, HTTP_METHODS, False),
    "httpx.Client": (REMOTE, HTTP_METHODS, False),
    "httpx.AsyncClient": (REMOTE, HTTP_METHODS, False),
    "aiohttp.ClientSession": (REMOTE, HTTP_METHODS, False),
    "aiohttp.client.ClientSession": (REMOTE, HTTP_METHODS, False),
    "urllib3.PoolManager": (REMOTE, {"request", "urlopen"}, False),
    "boto3.client": (REMOTE, ANY_METHOD, False),
    "boto3.resource": (REMOTE, ANY_METHOD, False),
    "aioboto3.client": (REMOTE, ANY_METHOD, False),
    "aioboto3.resource": (REMOTE, ANY_METHOD, False),
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
    "redis.Redis": (MESSAGE, {"publish"}, False),
    "redis.StrictRedis": (MESSAGE, {"publish"}, False),
    "redis.asyncio.Redis": (MESSAGE, {"publish"}, False),
    "redis.from_url": (MESSAGE, {"publish"}, False),
    "nats.connect": (MESSAGE, {"publish"}, False),
    "google.cloud.pubsub_v1.PublisherClient": (MESSAGE, {"publish"}, False),
    "paho.mqtt.client.Client": (MESSAGE, {"publish"}, False),
}
DIRECT_CALLS = {
    f"{module}.{method}": REMOTE
    for module in ("requests", "httpx")
    for method in (
        "get",
        "post",
        "put",
        "patch",
        "delete",
        "head",
        "options",
        "request",
    )
}
DIRECT_CALLS.update(
    {
        "httpx.stream": REMOTE,
        "aiohttp.request": REMOTE,
        "urllib.request.urlopen": REMOTE,
        "urllib3.request": REMOTE,
    }
)
BOTO_SERVICES = {
    "dynamodb": (DATABASE, {}),
    "sqs": (REMOTE, {"send_message": MESSAGE, "send_message_batch": MESSAGE}),
    "sns": (REMOTE, {"publish": MESSAGE, "publish_batch": MESSAGE}),
    "events": (REMOTE, {"put_events": MESSAGE}),
    "kinesis": (REMOTE, {"put_record": MESSAGE, "put_records": MESSAGE}),
    "firehose": (REMOTE, {"put_record": MESSAGE, "put_record_batch": MESSAGE}),
}
NON_OPERATIONS = ("get_paginator", "get_waiter", "can_paginate", "close", "generate_")
ANNOTATED = "annotation"
MAX_DEPTH = 6


TASK_CALLS = {"asyncio.create_task", "asyncio.ensure_future"}


def is_task_call(node, aliases):
    return isinstance(node, ast.Call) and (
        dotted_name(node.func, aliases) in TASK_CALLS
        or (isinstance(node.func, ast.Attribute) and node.func.attr == "create_task")
    )


def is_self(node):
    return isinstance(node, ast.Name) and node.id in {"self", "cls"}


def text_of(node):
    return ast.unparse(node)


def bound_values(tree):
    names, attributes = {}, {}
    for node in ast.walk(tree):
        pairs = []
        if isinstance(node, ast.Assign):
            pairs = [(t, node.value) for t in node.targets]
        elif isinstance(node, ast.AnnAssign):
            pairs = [(node.target, node.value or (ANNOTATED, node.annotation))]
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            pairs = [(i.optional_vars, i.context_expr) for i in node.items]
        elif isinstance(node, ast.NamedExpr):
            pairs = [(node.target, node.value)]
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            pairs = [
                (ast.Name(id=a.arg), (ANNOTATED, a.annotation))
                for a in node.args.posonlyargs + node.args.args + node.args.kwonlyargs
                if a.annotation is not None
            ]
        for target, value in pairs:
            if isinstance(target, ast.Name):
                names.setdefault(target.id, []).append(value)
            elif isinstance(target, ast.Attribute) and is_self(target.value):
                attributes.setdefault(target.attr, []).append(value)
    return names, attributes


GROWING_METHODS = {"append", "extend", "add", "insert", "update", "setdefault"}


def grown_names(tree):
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name):
            found.add(node.target.id)
        elif (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in GROWING_METHODS
            and isinstance(node.func.value, ast.Name)
        ):
            found.add(node.func.value.id)
    return found


class Remote:
    def __init__(self, context):
        self.context = context
        self.aliases = context.aliases
        self.names, self.attributes = bound_values(context.tree)
        self.grown = grown_names(context.tree)

    def factory_of(self, call):
        name = dotted_name(call.func, self.aliases)
        return name if name in CLIENTS or name in LIMITER_FACTORIES else None

    def origin(self, node, depth=0, deep=False):
        if depth > MAX_DEPTH:
            return None
        if isinstance(node, ast.Await):
            return self.origin(node.value, depth + 1, deep)
        if isinstance(node, tuple):
            name = dotted_name(node[1], self.aliases)
            return Origin(name, None) if name in CLIENTS else None
        if isinstance(node, ast.Call):
            factory = self.factory_of(node)
            if factory:
                return Origin(factory, node)
            if isinstance(node.func, ast.Attribute):
                return self.origin(node.func.value, depth + 1, deep)
            return None
        if isinstance(node, ast.Name):
            return self.single(self.names.get(node.id, []), depth)
        if isinstance(node, ast.Attribute):
            if is_self(node.value):
                return self.single(self.attributes.get(node.attr, []), depth)
            return self.origin(node.value, depth + 1, deep) if deep else None
        return None

    def single(self, values, depth):
        found = [self.origin(value, depth + 1) for value in values]
        factories = {o.factory if o else None for o in found}
        return found[0] if len(factories) == 1 and None not in factories else None

    def client_call(self, call):
        func = call.func
        if not isinstance(func, ast.Attribute):
            return None
        receiver = func.value
        found = self.origin(receiver, deep=True)
        if found is None or found.factory not in CLIENTS:
            return None
        kind, methods, deep = CLIENTS[found.factory]
        if receiver_depth(receiver) and not deep:
            return None
        if found.factory in BOTO_FACTORIES:
            return boto_kind(found.call, func.attr)
        if methods is ANY_METHOD:
            allowed = not func.attr.startswith(NON_OPERATIONS) and func.attr[0] != "_"
        else:
            allowed = func.attr in methods
        return kind if allowed else None

    def kind(self, call):
        direct = DIRECT_CALLS.get(dotted_name(call.func, self.aliases))
        return direct or self.client_call(call)


def receiver_depth(receiver):
    return isinstance(receiver, ast.Attribute) and not is_self(receiver.value)


def boto_kind(call, method):
    service = call.args[0] if call is not None and call.args else None
    name = service.value if isinstance(service, ast.Constant) else None
    default, methods = BOTO_SERVICES.get(name, (REMOTE, {}))
    if default == DATABASE or method.startswith(NON_OPERATIONS) or method[0] == "_":
        return None
    return methods.get(method, default)


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


def remote_of(context):
    return context.project.memo((REMOTE, context.path), lambda _: Remote(context))
