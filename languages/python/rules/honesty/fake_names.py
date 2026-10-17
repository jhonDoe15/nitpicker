CLOCK = "clock"
SLEEP = "sleep"
RANDOM = "random"
NETWORK = "network"
TIME_FAKES = {"freezegun", "time_machine", "pytest_freezegun", "pytest_freezer"}
NETWORK_FAKES = {
    "responses",
    "requests_mock",
    "respx",
    "httpretty",
    "pytest_httpserver",
    "vcr",
    "vcrpy",
    "pytest_httpx",
    "aioresponses",
    "pytest_recording",
}
MODULE_KINDS = {
    **{module: {CLOCK, SLEEP} for module in TIME_FAKES},
    **{module: {NETWORK} for module in NETWORK_FAKES},
}
FIXTURE_KINDS = {
    "freezer": {CLOCK, SLEEP},
    "time_machine": {CLOCK, SLEEP},
    "freezegun": {CLOCK, SLEEP},
    "frozen_time": {CLOCK, SLEEP},
    "requests_mock": {NETWORK},
    "httpx_mock": {NETWORK},
    "respx_mock": {NETWORK},
    "aioresponses": {NETWORK},
    "httpserver": {NETWORK},
    "httpretty": {NETWORK},
    "vcr": {NETWORK},
    "cassette": {NETWORK},
    "block_network": {NETWORK},
    "disable_socket": {NETWORK},
}
MARK_KINDS = {
    "freeze_time": {CLOCK, SLEEP},
    "vcr": {NETWORK},
    "block_network": {NETWORK},
    "default_cassette": {NETWORK},
}
CLOCK_NAMES = {
    "now",
    "utcnow",
    "today",
    "time",
    "time_ns",
    "monotonic",
    "perf_counter",
    "datetime",
    "date",
    "clock",
    "timezone",
}
SLEEP_NAMES = {"sleep", "time", "asyncio"}
RANDOM_NAMES = {
    "random",
    "randint",
    "randrange",
    "choice",
    "choices",
    "shuffle",
    "sample",
    "uniform",
    "uuid",
    "uuid4",
    "uuid1",
    "secrets",
    "urandom",
    "token_hex",
}
NETWORK_NAMES = {
    "requests",
    "httpx",
    "urlopen",
    "socket",
    "urllib",
    "urllib3",
    "aiohttp",
    "session",
    "client",
    "http",
}
PATCH_CALLS = {"patch", "setattr", "object"}
PATCH_OWNERS = {"monkeypatch", "mocker", "mock", "patch", "patcher"}
SEED_NAMES = {"seed", "Random", "default_rng", "RandomState", "SeedSequence"}
SETUP_METHODS = {"setUp", "setUpClass", "asyncSetUp", "setup_method", "setup_class"}
