from smells.io_index import CLIENT_FACTORIES

HTTP_VERBS = ("get", "post", "put", "patch", "delete", "head", "options", "request")
SUBPROCESS_CALLS = (
    "run",
    "call",
    "check_call",
    "check_output",
    "Popen",
    "getoutput",
    "getstatusoutput",
)
SHUTIL_CALLS = (
    "copy",
    "copy2",
    "copyfile",
    "copytree",
    "copymode",
    "copystat",
    "rmtree",
    "move",
    "chown",
    "make_archive",
    "unpack_archive",
    "disk_usage",
    "which",
)
TEMPFILE_CALLS = (
    "mkstemp",
    "mkdtemp",
    "NamedTemporaryFile",
    "TemporaryFile",
    "TemporaryDirectory",
    "SpooledTemporaryFile",
)
SOCKET_CALLS = (
    "socket",
    "create_connection",
    "create_server",
    "getaddrinfo",
    "gethostbyname",
    "gethostbyaddr",
    "socketpair",
    "fromfd",
)
CONNECTING_CLIENTS = {
    "sqlite3.connect",
    "psycopg.connect",
    "psycopg2.connect",
    "pymysql.connect",
    "pymongo.MongoClient",
}
LAZY_CLIENTS = frozenset(CLIENT_FACTORIES - CONNECTING_CLIENTS) | {
    "sqlalchemy.create_engine",
    "sqlalchemy.ext.asyncio.create_async_engine",
    "redis.StrictRedis",
    "redis.asyncio.Redis",
    "boto3.Session",
    "http.client.HTTPConnection",
    "http.client.HTTPSConnection",
}
CONNECT_WITH_HOST = {
    "smtplib.SMTP",
    "smtplib.SMTP_SSL",
    "smtplib.LMTP",
    "ftplib.FTP",
    "ftplib.FTP_TLS",
}
INPUT_OUTPUT_FUNCTIONS = (
    {f"requests.{verb}" for verb in HTTP_VERBS}
    | {f"httpx.{verb}" for verb in HTTP_VERBS + ("stream",)}
    | {f"subprocess.{name}" for name in SUBPROCESS_CALLS}
    | {f"shutil.{name}" for name in SHUTIL_CALLS}
    | {f"tempfile.{name}" for name in TEMPFILE_CALLS}
    | {f"socket.{name}" for name in SOCKET_CALLS}
    | {
        "urllib.request.urlopen",
        "urllib.request.urlretrieve",
        "urllib3.request",
        "os.popen",
        "glob.glob",
        "glob.iglob",
    }
    | CONNECTING_CLIENTS
    | CONNECT_WITH_HOST
    | LAZY_CLIENTS
)
STARTED_FUNCTIONS = {
    "asyncio.run",
    "multiprocessing.Pool",
    "multiprocessing.pool.Pool",
    "multiprocessing.pool.ThreadPool",
    "uvicorn.run",
    "waitress.serve",
}
FILE_HANDLERS = {
    "logging.FileHandler",
    "logging.handlers.RotatingFileHandler",
    "logging.handlers.TimedRotatingFileHandler",
    "logging.handlers.WatchedFileHandler",
}
STARTABLE = {
    "threading.Thread": {"start"},
    "threading.Timer": {"start"},
    "multiprocessing.Process": {"start"},
    "concurrent.futures.ThreadPoolExecutor": {"submit", "map"},
    "concurrent.futures.ProcessPoolExecutor": {"submit", "map"},
    "asyncio.get_event_loop": {"run_until_complete", "run_forever"},
    "asyncio.new_event_loop": {"run_until_complete", "run_forever"},
}
SCHEDULER_PACKAGE = "apscheduler."
SCHEDULER_SUFFIX = "Scheduler"
SCHEDULER_STARTS = {"start"}
CLIENT_METHODS = {"connect", "ping", "begin", "raw_connection", "getresponse"}
QUIET_AT_IMPORT = LAZY_CLIENTS | CONNECT_WITH_HOST | {"Path.resolve"}
