import ast
import os

from checks.common import call_name, directories, dotted_name, finding

ENVIRONMENT_NAMES = {
    "os.environ",
    "os.environb",
    "os.getenv",
    "os.getenvb",
    "os.putenv",
    "os.unsetenv",
}
COMPOSITION_ROOT_STEMS = {
    "main",
    "__main__",
    "server",
    "composition_root",
    "manage",
    "wsgi",
    "asgi",
    "settings",
    "setup",
    "conf",
    "noxfile",
}
COMPOSITION_ROOT_DIRECTORIES = {"composition_root", "settings"}
CLOCK_CALLS = {
    "datetime.datetime.now",
    "datetime.datetime.utcnow",
    "datetime.datetime.today",
    "datetime.date.today",
    "time.time",
    "time.time_ns",
    "time.monotonic",
    "time.monotonic_ns",
    "time.perf_counter",
    "time.perf_counter_ns",
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
    "seed",
    "triangular",
    "normalvariate",
}
RANDOM_CALLS = {
    "uuid.uuid1",
    "uuid.uuid4",
    "os.urandom",
    "secrets.token_hex",
    "secrets.token_bytes",
    "secrets.token_urlsafe",
    "secrets.choice",
    "secrets.randbelow",
}
INPUT_OUTPUT_MODULES = {
    "socket",
    "ssl",
    "subprocess",
    "shutil",
    "tempfile",
    "glob",
    "sqlite3",
    "smtplib",
    "ftplib",
    "http.client",
    "http.server",
    "urllib.request",
    "requests",
    "httpx",
    "aiohttp",
    "urllib3",
    "sqlalchemy",
    "psycopg",
    "psycopg2",
    "asyncpg",
    "pymysql",
    "pymongo",
    "redis",
    "boto3",
    "botocore",
}
INPUT_OUTPUT_CALLS = {"open", "input", "time.sleep", "asyncio.sleep", "os.system"}


def is_composition_root(path):
    stem = os.path.basename(path)[: -len(".py")] if path.endswith(".py") else path
    return stem in COMPOSITION_ROOT_STEMS or bool(
        COMPOSITION_ROOT_DIRECTORIES.intersection(directories(path))
    )


def environment_findings(context):
    if context.tests or is_composition_root(context.path):
        return []
    findings = []
    for node in ast.walk(context.tree):
        reads = isinstance(node, ast.Attribute) or (
            isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load)
        )
        name = dotted_name(node, context.aliases) if reads else None
        if name in ENVIRONMENT_NAMES:
            findings.append(finding(context.path, "process-env-access", name, node))
    return findings


def impure_call_rule(name):
    if name in CLOCK_CALLS:
        return "clock-now"
    module, _, function = name.rpartition(".")
    if (module == "random" and function in RANDOM_FUNCTIONS) or name in RANDOM_CALLS:
        return "random-in-domain"
    return "io-in-domain" if name in INPUT_OUTPUT_CALLS else None


def imported_modules(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield alias.name, node
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            yield node.module, node


def is_input_output_module(module):
    return any(
        module == listed or module.startswith(f"{listed}.")
        for listed in INPUT_OUTPUT_MODULES
    )


def domain_findings(context):
    if not context.domain:
        return []
    findings = []
    for node in ast.walk(context.tree):
        name = call_name(node, context.aliases)
        rule = impure_call_rule(name) if name else None
        if rule is not None:
            findings.append(finding(context.path, rule, name, node))
    for module, node in imported_modules(context.tree):
        if is_input_output_module(module):
            findings.append(finding(context.path, "io-in-domain", module, node))
    return findings


def check(context):
    return environment_findings(context) + domain_findings(context)
