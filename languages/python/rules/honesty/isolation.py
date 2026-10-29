import ast

from checks.common import call_name, dotted_name, finding, overlap_sites
from honesty.fakes import CLOCK, NETWORK, RANDOM, SLEEP, fakes_of

CLOCK_CALLS = {
    "datetime.datetime.now",
    "datetime.datetime.utcnow",
    "datetime.datetime.today",
    "datetime.date.today",
    "time.time",
    "time.time_ns",
    "time.localtime",
    "time.gmtime",
    "time.ctime",
    "time.asctime",
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
    "triangular",
    "normalvariate",
    "expovariate",
    "betavariate",
    "gammavariate",
    "lognormvariate",
    "vonmisesvariate",
    "paretovariate",
    "weibullvariate",
}
NUMPY_RANDOM_FUNCTIONS = RANDOM_FUNCTIONS | {
    "rand",
    "randn",
    "normal",
    "permutation",
    "bytes",
    "binomial",
    "poisson",
    "standard_normal",
}
RANDOM_CALLS = {
    "secrets.token_hex",
    "secrets.token_bytes",
    "secrets.token_urlsafe",
    "secrets.randbelow",
    "secrets.choice",
    "secrets.SystemRandom",
    "random.SystemRandom",
    "os.urandom",
    "uuid.uuid1",
    "uuid.uuid4",
}
UNSEEDED_FACTORIES = {
    "random.Random",
    "numpy.random.default_rng",
    "numpy.random.RandomState",
    "numpy.random.Generator",
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
    "aiohttp.ClientSession",
    "urllib3.PoolManager",
}
INTEGRATION_DIRECTORIES = {
    "integration",
    "e2e",
    "functional",
    "system",
    "acceptance",
    "smoke",
}
SLEEP_CALLS = {"time.sleep"}
CLOCK_OVERLAPS = {"real-clock-in-test": ("DTZ002", "DTZ003", "DTZ005", "DTZ011")}


def is_random(name, node):
    module, _, function = name.rpartition(".")
    if module == "random" and function in RANDOM_FUNCTIONS:
        return True
    if module == "numpy.random" and function in NUMPY_RANDOM_FUNCTIONS:
        return True
    if name in UNSEEDED_FACTORIES:
        return not (node.args or node.keywords)
    return name in RANDOM_CALLS


def is_network(name, _node):
    module, _, function = name.rpartition(".")
    return (
        module in NETWORK_MODULES and function in NETWORK_VERBS
    ) or name in NETWORK_CALLS


def is_clock(name, _node):
    return name in CLOCK_CALLS


def is_sleep(name, node):
    if name == "asyncio.sleep":
        return not (
            node.args
            and isinstance(node.args[0], ast.Constant)
            and node.args[0].value == 0
        )
    return name in SLEEP_CALLS


def is_integration(path):
    return bool(INTEGRATION_DIRECTORIES.intersection(path.split("/")[:-1]))


def sleeping_functions(project):
    def build(_):
        found = {}
        for path, context in project.contexts.items():
            if not context.tests:
                found[path] = sleepers_of(context)
        return found

    return project.memo("sleeping", build)


def sleepers_of(context):
    names = set()
    for node in ast.walk(context.tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for part in ast.walk(node):
                name = call_name(part, context.aliases)
                if name and is_sleep(name, part):
                    names.add(node.name)
    return names


def sleeping_helper(name, project):
    located = project.locate(name)
    if located is None:
        return False
    path, function = located
    return function in sleeping_functions(project).get(path, set())


def rule_checks(context):
    checks = [
        ("real-clock-in-test", is_clock, CLOCK),
        ("random-in-test", is_random, RANDOM),
        ("sleep-in-test", is_sleep, SLEEP),
    ]
    if not is_integration(context.path):
        checks.append(("network-in-test", is_network, NETWORK))
    return checks


def check(context):
    if not context.tests:
        return []
    fakes = fakes_of(context)
    found = []
    for node in ast.walk(context.tree):
        name = call_name(node, context.aliases)
        if not name:
            continue
        for rule, matches, kind in rule_checks(context):
            is_helper = rule == "sleep-in-test" and sleeping_helper(
                name, context.project
            )
            if (matches(name, node) or is_helper) and kind not in fakes.kinds_at(node):
                found.append(finding(context.path, rule, name, node))
    return found


def busy_wait_sites(context, sleeps):
    return [
        {
            "rule": "ASYNC110",
            "path": context.path,
            "line": node.lineno,
            "owner": "sleep-in-test",
        }
        for node in ast.walk(context.tree)
        if isinstance(node, ast.While)
        and any(statement.lineno in sleeps for statement in node.body)
    ]


def allowances(context):
    found = check(context)
    sleeps = {item["line"] for item in found if item["rule"] == "sleep-in-test"}
    return overlap_sites(found, CLOCK_OVERLAPS) + busy_wait_sites(context, sleeps)
