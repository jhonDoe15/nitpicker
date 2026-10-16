import ast
import re

from checks.common import call_name, finding

CLOCK_CALLS = {
    "datetime.datetime.now",
    "datetime.datetime.utcnow",
    "datetime.datetime.today",
    "datetime.date.today",
    "time.time",
    "time.time_ns",
}
RANDOM_FUNCTIONS = {
    "random",
    "randint",
    "randrange",
    "choice",
    "choices",
    "shuffle",
    "sample",
    "uniform",
    "gauss",
    "getrandbits",
    "randbytes",
}
RANDOM_CALLS = {
    "secrets.token_hex",
    "secrets.token_bytes",
    "secrets.token_urlsafe",
    "os.urandom",
}
NETWORK_MODULES = ("requests", "httpx")
NETWORK_VERBS = {
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options",
    "request",
    "stream",
}
NETWORK_CALLS = {
    "urllib.request.urlopen",
    "socket.create_connection",
    "http.client.HTTPConnection",
    "http.client.HTTPSConnection",
    "requests.Session",
    "httpx.Client",
    "httpx.AsyncClient",
}
INTEGRATION_DIRECTORIES = {
    "integration",
    "e2e",
    "functional",
    "system",
    "acceptance",
    "smoke",
}
FAKED_CLOCK = re.compile(
    r"freezegun|freeze_time|time_machine|\bfreezer\b|(?:setattr|patch)\([^)]*(?:datetime|time|clock)"
)
FAKED_RANDOM = re.compile(r"\bseed\(|\bRandom\(|(?:setattr|patch)\([^)]*random")
FAKED_NETWORK = re.compile(
    r"responses|requests_mock|respx|httpretty|pytest_httpserver|httpserver|vcr|pytest_httpx"
    r"|httpx_mock|aioresponses|(?:setattr|patch)\([^)]*(?:requests|httpx|urlopen|socket|urllib)"
)


def is_random(name):
    module, _, function = name.rpartition(".")
    return (module == "random" and function in RANDOM_FUNCTIONS) or name in RANDOM_CALLS


def is_network(name):
    module, _, function = name.rpartition(".")
    return (
        module in NETWORK_MODULES and function in NETWORK_VERBS
    ) or name in NETWORK_CALLS


def is_integration(path):
    return bool(INTEGRATION_DIRECTORIES.intersection(path.split("/")[:-1]))


def check(context):
    if not context.tests:
        return []
    checks = [
        ("real-clock-in-test", CLOCK_CALLS.__contains__, FAKED_CLOCK),
        ("random-in-test", is_random, FAKED_RANDOM),
    ]
    if not is_integration(context.path):
        checks.append(("network-in-test", is_network, FAKED_NETWORK))
    found = []
    for rule, matches, faked in checks:
        if faked.search(context.text):
            continue
        for node in ast.walk(context.tree):
            name = call_name(node, context.aliases)
            if name and matches(name):
                found.append(finding(context.path, rule, name, node))
    return found
