import ast

from checks.common import call_name, dotted_name, finding
from honesty.fakes import CLOCK, NETWORK, RANDOM, SLEEP, fakes_of
from honesty.sleeps import star_modules, starred_name, wall_clock_waits

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
    waits = wall_clock_waits(context)
    stars = star_modules(context.tree)
    for node in ast.walk(context.tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for part in ast.walk(node):
                name = call_name(part, context.aliases)
                if name and waits(starred_name(name, part, stars), part):
                    names.add(node.name)
    return names


def sleeping_helper(name, project):
    located = project.locate(name)
    if located is None:
        return False
    path, function = located
    return function in sleeping_functions(project).get(path, set())


def rule_checks(context):
    def sleeps_inside(name):
        return sleeping_helper(name, context.project)

    checks = [
        ("real-clock-in-test", is_clock, CLOCK),
        ("random-in-test", is_random, RANDOM),
        ("sleep-in-test", wall_clock_waits(context, sleeps_inside), SLEEP),
    ]
    if not is_integration(context.path):
        checks.append(("network-in-test", is_network, NETWORK))
    return checks


def check(context):
    if not context.tests:
        return []
    fakes = fakes_of(context)
    stars = star_modules(context.tree)
    checks = rule_checks(context)
    found = []
    for node in ast.walk(context.tree):
        name = call_name(node, context.aliases)
        if not name:
            continue
        name = starred_name(name, node, stars)
        for rule, matches, kind in checks:
            if matches(name, node) and kind not in fakes.kinds_at(node):
                found.append(finding(context.path, rule, name, node))
    return found
