# Python: nitpicker rules

The Python rules nitpicker's own script checks (`python-rules/*`), the coupling and import-cycle findings, the ruff format check and the finding for a run in which no tests ran. This page lists 121 rules. [All pages](README.md).

The guide for these rules: [docs/python-preset.md](../python-preset.md).

Unless an entry says otherwise:

- **Presets:** Python
- **Analyzers:** `python`
- **Why it is on:** One of the checks of nitpicker's own Python script. It runs on the Python source and tests and names one allowed form.

<a id="coupling-no-import-outside-roots"></a>

### `coupling/no-import-outside-roots`

Production code imports a project module outside `python.sourceRoots`.

- **Why it is on:** Code outside the source roots is not checked by the gate, so production code must not depend on it.
- **Allowed form:** Move the imported code under a source root, or add its folder to `python.sourceRoots` so the gate checks it.
- **Exception:** It has no exception: set `python.sourceRoots`.

<a id="coupling-no-production-cycles"></a>

### `coupling/no-production-cycles`

A module that is in an import cycle with other modules of its package.

- **Why it is on:** A cycle makes modules impossible to load, test or replace one at a time.
- **Allowed form:** Move what they share into a module both import, or pass it in instead of importing it back.
- **Exception:** If this is intended, add `{"rule":"no-production-cycles","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-any-in-domain"></a>

### `python-rules/any-in-domain`

`<name>` uses `Any` in domain code.

- **Allowed form:** Use the real type, a `Protocol`, a `TypeVar` or a frozen dataclass; parse untrusted data at the boundary so the domain only sees typed values.
- **Exception:** If this is intended, add `{"rule":"any-in-domain","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-atomic-update-across-await"></a>

### `python-rules/atomic-update-across-await`

`<name>` is updated from a value read before an `await`: another task can change it while this one is suspended, and the write then overwrites that change.

- **Allowed form:** Await the new value into a local first and read and write the shared state in one step with no `await` between them (`delta = await fetch()` then `self.total += delta`), or serialize the whole update with one lock that every task shares (`self.lock = asyncio.Lock()` in `__init__`, then `async with self.lock:`); a lock or semaphore built in the method, a semaphore of more than one slot and a lock passed in are not proof.
- **Exception:** If this is intended, add `{"rule":"atomic-update-across-await","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-blind-suppress"></a>

### `python-rules/blind-suppress`

`<name>` ignores every error.

- **Allowed form:** Name the expected exception: `contextlib.suppress(KeyError)`; or handle it or re-raise it with its cause. In a test, use `pytest.raises(SpecificError)` (`self.assertRaises` in unittest).
- **Exception:** If this is intended, add `{"rule":"blind-suppress","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-blocking-helper-in-async"></a>

### `python-rules/blocking-helper-in-async`

`<name>`, so this async function blocks the event loop and stalls every other task.

- **Allowed form:** Run the helper in a worker thread: `await asyncio.to_thread(fetch_profile, url)` or `await loop.run_in_executor(None, fetch_profile, url)`, or use an async client (`httpx.AsyncClient`, `aiohttp`) and `await asyncio.sleep(...)`. Work done at startup, before the loop serves requests, takes an exception.
- **Exception:** If this is intended, add `{"rule":"blocking-helper-in-async","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-boolean-flag-parameter"></a>

### `python-rules/boolean-flag-parameter`

`<name>` switches a public function between two behaviors.

- **Allowed form:** Make the flag keyword-only, `def send(message, *, urgent=False)`, split the function into two named for each behavior, or pass an enum. click, typer and FastAPI pass options by keyword, so `def command(*, verbose: bool)` works there. A method that overrides a base class takes `@typing.override` (`typing_extensions.override` before Python 3.12), which lifts the rule.
- **Exception:** If this is intended, add `{"rule":"boolean-flag-parameter","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-cached-rejection"></a>

### `python-rules/cached-rejection`

`<name>`: a cached task or future keeps its failure, so every later call replays it instead of trying again.

- **Allowed form:** Store the task, then clear the attribute in an `except` only while it still holds this attempt: `attempt = asyncio.ensure_future(self._open()); self._connection = attempt; try: return await attempt; except Exception: if self._connection is attempt: self._connection = None; raise`. Cache an async result by awaiting first (`self._value = await load()`), not with `functools.cache`. An exception fits only when keeping the first failure is intended (a startup-only cache).
- **Exception:** If this is intended, add `{"rule":"cached-rejection","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-cancellation-not-propagated"></a>

### `python-rules/cancellation-not-propagated`

`<name>` has a path that consumes cancellation or replaces it with another error.

- **Allowed form:** After cleanup, use a bare `raise` or re-raise the unchanged caught cancellation. Keep intentional cancellation boundaries in the backend's timeout or cancellation scope; returning a failure result or chaining another error does not propagate cancellation.
- **Exception:** If this is intended, add `{"rule":"cancellation-not-propagated","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-catch-log-without-exception"></a>

### `python-rules/catch-log-without-exception`

`<name>` logs a caught error without its traceback.

- **Allowed form:** Keep the traceback: `logger.exception("message")` or `logger.error("message", exc_info=True)`; the exception as an argument drops it. Re-raising after the log also passes.
- **Exception:** If this is intended, add `{"rule":"catch-log-without-exception","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-cleanup-skipped-on-failure"></a>

### `python-rules/cleanup-skipped-on-failure`

`<name>`: when the first release raises, the later steps never run, so a connection stays open and the state is not reset.

- **Allowed form:** Register every release on `contextlib.ExitStack` or `AsyncExitStack` (`stack.callback(x.close)`, `await stack.enter_async_context(...)`), or `await asyncio.gather(..., return_exceptions=True)` and raise the first failure, or `try:` with the reset in `finally:`. An exception fits only when a failed release should abort the remaining ones.
- **Exception:** If this is intended, add `{"rule":"cleanup-skipped-on-failure","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-client-without-timeout"></a>

### `python-rules/client-without-timeout`

`<name>` has no statement timeout, so a stuck query holds the request and its database connection for good.

- **Allowed form:** Set a statement timeout where the connection is made: `options="-c statement_timeout=30000"` for psycopg (in `connect_args` for a SQLAlchemy engine, in `OPTIONS` for Django), `command_timeout=30` for asyncpg. An exception fits only for a connection meant to wait without a limit, such as a migration runner, or when the database role sets the timeout.
- **Exception:** If this is intended, add `{"rule":"client-without-timeout","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-clock-now"></a>

### `python-rules/clock-now`

`<name>()` reads the clock in domain code.

- **Allowed form:** Take the time as a parameter or a `Callable[[], datetime]` and call `datetime.now(tz=UTC)` in the composition root.
- **Exception:** If this is intended, add `{"rule":"clock-now","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-compatibility-shim"></a>

### `python-rules/compatibility-shim`

`<name>` keeps an old name working.

- **Allowed form:** When code moves or is renamed, change every caller in the same change and delete the old name: keep no alias, forwarding function, module `__getattr__`, `@deprecated` marker or deprecation warning. A published library keeps the deprecation of its public names, and that path takes an exception.
- **Exception:** If this is intended, add `{"rule":"compatibility-shim","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-conditional-assertion-in-test"></a>

### `python-rules/conditional-assertion-in-test`

Test `<name>` asserts inside an `if` branch or conditional expression.

- **Allowed form:** Give each outcome its own test with `@pytest.mark.parametrize` and assert unconditionally; a loop may build the data, then one `assert` checks it.
- **Exception:** If this is intended, add `{"rule":"conditional-assertion-in-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-contract-infrastructure-type"></a>

### `python-rules/contract-infrastructure-type`

Take a repository or a port (a `Protocol` the feature defines) and return frozen dataclasses or domain types from `<name>`: `<type>` is a persistence handle, so every importer of this feature depends on its database session.

- **Allowed form:** Keep a persistence handle inside a repository class, a module named for infrastructure (`adapters.py`, `persistence.py`, `repository.py`, `db.py`, `deps.py`) or a module whose name starts with `_`, and pass it in from the composition root; read a request in the route handler or view and pass the values in.
- **Exception:** If this is intended, add `{"rule":"contract-infrastructure-type","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-copied-constant-in-test"></a>

### `python-rules/copied-constant-in-test`

This literal copies \<name>: when the constant changes, the test keeps checking the old value or stops testing the case it was written for.

- **Allowed form:** Use `<name>` (or an expression on it, such as `<name> + 1`). If the value is a contract the test pins on purpose, assert it next to the constant (`assert <name> == <value>`).
- **Exception:** If this is intended, add `{"rule":"copied-constant-in-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Java and Kotlin counterpart `CopiedConstantInTest`](java-nitpicker.md#pmd-copiedconstantintest), [TypeScript and JavaScript counterpart `nitpicker/no-copied-constant`](typescript-nitpicker.md#eslint-nitpicker-no-copied-constant), [Go counterpart `go-rules/copied-constant-in-test`](../go-preset.md#own-rules)

<a id="python-rules-credential-shape"></a>

### `python-rules/credential-shape`

A string has the shape of a credential.

- **Allowed form:** Read the credential from the environment in the composition root and pass it in; never commit a key, token, private key or URL with a password.
- **Exception:** If this is intended, add `{"rule":"credential-shape","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-eager-relationship"></a>

### `python-rules/eager-relationship`

`<name>` loads its related rows on every query of the model.

- **Allowed form:** Leave `lazy` at its default (or set `lazy="raise"`) and load the relation on the queries that need it: `select(Order).options(selectinload(Order.lines))`. An exception fits only for a small lookup relation that every read of the model needs.
- **Exception:** If this is intended, add `{"rule":"eager-relationship","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-enum-string-constants"></a>

### `python-rules/enum-string-constants`

\<name> are string constants that belong in one enum.

- **Allowed form:** Declare an enum: `class Status(enum.StrEnum): ACTIVE = "active"` on Python 3.11+, otherwise `class Status(str, enum.Enum)`.
- **Exception:** If this is intended, add `{"rule":"enum-string-constants","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-env-none-only-check"></a>

### `python-rules/env-none-only-check`

`<name>` is tested only for being missing, so an empty value counts as set: `<name>=` gives `""`, which passes `is not None` and `in os.environ` and skips a `getenv` default.

- **Allowed form:** Test the value for truth: `if not os.environ.get("API_URL"):`, `os.environ.get("PORT") or "8000"` instead of a default argument, or `.strip()` first when blanks count as empty. An exception fits only when an empty value is a real setting here.
- **Exception:** If this is intended, add `{"rule":"env-none-only-check","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-exhaustive-enum-predicate"></a>

### `python-rules/exhaustive-enum-predicate`

These comparisons list only some members of `<enum>`, so a member added later is silently classified as the default.

- **Allowed form:** Classify every member with a `match` that ends in `case _: assert_never(value)` (or an `if`/`elif` chain that ends in `else: assert_never(value)`), so the type checker fails when a member is added.
- **Exception:** If this is intended, add `{"rule":"exhaustive-enum-predicate","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-explicit-any"></a>

### `python-rules/explicit-any`

`<name>` is typed with an explicit `Any`.

- **Allowed form:** Write the concrete type, a `Protocol`, a `TypeVar`, a `ParamSpec` or `object` (`dict[str, object]`, `Callable[..., object]`).
- **Exception:** If this is intended, add `{"rule":"explicit-any","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-falsy-default"></a>

### `python-rules/falsy-default`

`<name>` replaces a falsy argument with a default, so `0`, `""`, `[]` and `False` count as not given.

- **Allowed form:** Test for `None` only: `limit if limit is not None else DEFAULT_LIMIT`, or `if limit is None: limit = DEFAULT_LIMIT`.
- **Exception:** If this is intended, add `{"rule":"falsy-default","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-float-equality-in-test"></a>

### `python-rules/float-equality-in-test`

`<name>` is compared exactly in a test, so rounding makes it fail.

- **Allowed form:** Compare with a tolerance: `assert total == pytest.approx(0.3)` (it also takes lists and dicts), `math.isclose(total, 0.3)`, or `self.assertAlmostEqual(total, 0.3)`.
- **Exception:** If this is intended, add `{"rule":"float-equality-in-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-forwarding-method-alias"></a>

### `python-rules/forwarding-method-alias`

`<name>` only forwards its parameters to `undefined` and has the same signature.

- **Allowed form:** Call the target method directly and delete the alias.
- **Exception:** If this is intended, add `{"rule":"forwarding-method-alias","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-forwarding-wrapper"></a>

### `python-rules/forwarding-wrapper`

`<name>` only forwards its parameters to `<target>`, with the same parameter and return types.

- **Allowed form:** Call the target directly and delete the wrapper; to keep the name, import the target under it (`from module import target as name`) or bind it (`name = target`).
- **Exception:** If this is intended, add `{"rule":"forwarding-wrapper","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-frozen-dataclass"></a>

### `python-rules/frozen-dataclass`

Dataclass \<name> is not frozen.

- **Allowed form:** Declare records as `@dataclass(frozen=True)` and build a changed copy with `dataclasses.replace`.
- **Exception:** If this is intended, add `{"rule":"frozen-dataclass","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-future-without-exception"></a>

### `python-rules/future-without-exception`

`<name>` is completed only by `set_result` from a callback, so when the work behind the callback fails the future never completes and whoever awaits it waits forever.

- **Allowed form:** Give the callback a failure path that calls `set_exception` (`register(reply.set_result, reply.set_exception)`, or `except Exception as error: reply.set_exception(error)` around the work), or await a coroutine API that raises by itself, such as `loop.run_in_executor(...)` or `asyncio.to_thread(...)`.
- **Exception:** If this is intended, add `{"rule":"future-without-exception","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-generated-member-cycle"></a>

### `python-rules/generated-member-cycle`

The generated `==` and `hash()` can follow `<name>` around the cycle \<Class>.\<field> -> \<Other>.\<back> -> \<Class>, so comparing or hashing two objects of the cycle recurses until RecursionError.

- **Allowed form:** Leave the back reference out of the comparison: `field(compare=False)` in a dataclass, `attrs.field(eq=False)` in an attrs class. A field that only ever points down a tree, never back up, is the intended case.
- **Exception:** If this is intended, add `{"rule":"generated-member-cycle","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-generic-name"></a>

### `python-rules/generic-name`

`<name>` has a generic name.

- **Allowed form:** Name it for its job (`price_rounding.py`, `OrderRepository`); shared logic that belongs to no feature lives in `shared/` under a name that says what it does.
- **Exception:** If this is intended, add `{"rule":"generic-name","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-global-state-leak-in-test"></a>

### `python-rules/global-state-leak-in-test`

`<name>` changes process-wide state in a test and nothing puts it back, so the tests after it depend on the order they run in.

- **Allowed form:** Let pytest undo it: `monkeypatch.setenv`, `monkeypatch.setattr` or `mock.patch.dict(os.environ, ...)`, or save the old value and restore it in `finally`, after `yield` in a fixture, or in `tearDown`.
- **Exception:** If this is intended, add `{"rule":"global-state-leak-in-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-handle-unreleased-on-close"></a>

### `python-rules/handle-unreleased-on-close`

`<name>` registers a timer, callback or signal handler that the close method never cancels, so it fires after close and registrations pile up on each start.

- **Allowed form:** Keep the handle (`self._handle = loop.call_later(...)`) and call `self._handle.cancel()` in the close method, remove a signal handler with `loop.remove_signal_handler(...)` there, or stop a `threading.Timer` with `cancel()`. An exception fits only when the timer or handler dies with this object.
- **Exception:** If this is intended, add `{"rule":"handle-unreleased-on-close","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-handler-entity-type"></a>

### `python-rules/handler-entity-type`

Take and return a separate schema (a Pydantic model or a frozen dataclass) in the return type of route handler `<name>` and map `<Entity>` to it in the service: `<Entity>` is a ORM entity, so the response serializes every column and loaded relation and ties the API to the database schema.

- **Allowed form:** A SQLModel class without `table=True` or a django-ninja `Schema` is a schema, not an entity.
- **Exception:** If this is intended, add `{"rule":"handler-entity-type","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-handwritten-boundary-guard"></a>

### `python-rules/handwritten-boundary-guard`

`<name>` checks untrusted data by hand.

- **Allowed form:** Parse untrusted input once at the boundary with pydantic (`Model.model_validate(data)`) in an `adapters/` package, not with `isinstance` checks or a `TypeGuard`.
- **Exception:** If this is intended, add `{"rule":"handwritten-boundary-guard","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-hardcoded-secret"></a>

### `python-rules/hardcoded-secret`

The value of `<name>` is a hardcoded secret.

- **Allowed form:** Read the secret from the environment in the composition root (`os.environ["API_TOKEN"]`) and pass it in; keep placeholders such as `"changeme"` out of production code.
- **Exception:** If this is intended, add `{"rule":"hardcoded-secret","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-http-without-timeout"></a>

### `python-rules/http-without-timeout`

`<name>` can wait forever: it has no timeout.

- **Allowed form:** Pass a timeout in seconds: `urllib.request.urlopen(url, timeout=10)`, `session.get(url, timeout=10)`, or set `socket.setdefaulttimeout(10)` once at startup for `urllib`; an `httpx` client keeps its 5 second default unless you pass another number (`httpx.Client(timeout=10)`), never `timeout=None`.
- **Exception:** If this is intended, add `{"rule":"http-without-timeout","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-import-time-effect"></a>

### `python-rules/import-time-effect`

`<name>()` runs when the module is imported, so every import, tests included, performs it.

- **Allowed form:** Move the call into a function and call that from the composition root (`main.py`, a `create_app` factory) or under `if __name__ == "__main__":`, passing the result in.
- **Exception:** If this is intended, add `{"rule":"import-time-effect","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-in-memory-query"></a>

### `python-rules/in-memory-query`

`<name>` rows are counted, filtered, sorted or aggregated in Python after a query loaded them all, when the database could do it.

- **Allowed form:** Ask the database: `.count()` or `.exists()` instead of `len()` or a truth test; `.filter()`/`.exclude()` (Django) or `.where()` (SQLAlchemy) instead of a comprehension, `filter()` or `next()`, and `.filter(...).exists()` instead of `any()` or `all()`; `.order_by()` instead of `sorted()`, `.sort()` or `max(key=)`; `.aggregate()`/`.annotate()` (Django) or `func.sum`/`func.count` with `group_by` (SQLAlchemy) instead of `sum()`, `max()`, `min()` or `Counter`. An exception fits only for a small fixed lookup table that is meant to be loaded whole.
- **Exception:** If this is intended, add `{"rule":"in-memory-query","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Java and Kotlin counterpart `SpringDataFilterInQuery`](java-pmd.md#pmd-springdatafilterinquery), [TypeScript and JavaScript counterpart `nitpicker/no-in-memory-query`](typescript-nitpicker.md#eslint-nitpicker-no-in-memory-query)

<a id="python-rules-inconsistent-attribute-locking"></a>

### `python-rules/inconsistent-attribute-locking`

\<name>: a thread or task that writes here races with the locked writer, so an update is lost or another reader sees a stale value.

- **Allowed form:** Hold the same lock for every write of the attribute (`with self.lock:` or `async with self.lock:`), or keep the state where only the lock holder changes it (a method that takes the lock and returns the new value). `__init__`, `__new__`, `__post_init__`, a write in a nested function or lambda, a method the class calls while it holds a lock, a decorated method and a method that calls `acquire()` are not reported.
- **Exception:** If this is intended, add `{"rule":"inconsistent-attribute-locking","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-io-in-domain"></a>

### `python-rules/io-in-domain`

`<name>` does input or output in domain code.

- **Allowed form:** Keep `domain/` pure: define a `Protocol` in the domain and implement it in `adapters/`, then pass the adapter in.
- **Exception:** If this is intended, add `{"rule":"io-in-domain","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-io-in-loop"></a>

### `python-rules/io-in-loop`

`<name>` runs once per item of a loop.

- **Allowed form:** Batch it: fetch or write all items in one call, or run the calls together with a bounded `asyncio.gather` (a shared `asyncio.Semaphore` acquired in the task) or a `ThreadPoolExecutor.map` when there is no batch API.
- **Exception:** If this is intended, add `{"rule":"io-in-loop","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-linear-lookup-in-loop"></a>

### `python-rules/linear-lookup-in-loop`

`<name` is scanned for one `item<name>` on every pass of the loop, and it does not change in between.

- **Allowed form:** Build a `dict` once before the loop (`{item<name>: item for item in <name}`) and use `get` or `in`. An exception fits only for a list that always stays a handful of items, or items that cannot be hashed.
- **Exception:** If this is intended, add `{"rule":"linear-lookup-in-loop","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-list-used-as-set"></a>

### `python-rules/list-used-as-set`

`<name>` gets `append` and is searched with `in` inside a loop or a nested function, so every search scans the whole list.

- **Allowed form:** Keep it in a `set()` (`add`, `in`), or a `dict` used as an ordered set when the order matters (`seen[item] = None`, `list(seen)`). An exception fits only for a list that always stays a handful of items, or items that cannot be hashed.
- **Exception:** If this is intended, add `{"rule":"list-used-as-set","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-lock-order-inversion"></a>

### `python-rules/lock-order-inversion`

\<name>: two threads or tasks that run both can each hold one lock and wait forever for the other, a deadlock that no test reliably shows.

- **Allowed form:** Take nested locks in one order everywhere in the class (if any path takes `self.a` and then `self.b`, no path takes `self.b` and then `self.a`), or guard the state with one lock. Only locks held in attributes of the class or the module (`self.lock`, `Registry.LOCK`) are compared, when they are built there from `threading.Lock`, `threading.RLock`, `threading.Condition`, a one-slot `threading.Semaphore` or an `asyncio`, AnyIO or Trio lock, or are named like a lock where the build is out of sight; a lock passed in, held in a local or taken in a called method is not followed.
- **Exception:** If this is intended, add `{"rule":"lock-order-inversion","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-logger-in-domain"></a>

### `python-rules/logger-in-domain`

`<name>` is imported into domain code.

- **Allowed form:** Return a result that says what happened, or raise a domain error, and let `adapters/` or the composition root log it.
- **Exception:** If this is intended, add `{"rule":"logger-in-domain","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-many-to-many-cascade-delete"></a>

### `python-rules/many-to-many-cascade-delete`

The many-to-many relationship `<name>` deletes related rows that other owners still share.

- **Allowed form:** Cascade only `"save-update, merge"` on a `secondary=` (or `link_model=`) relationship; deleting the owner already deletes its rows in the association table.
- **Exception:** If this is intended, add `{"rule":"many-to-many-cascade-delete","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-mock-without-spec"></a>

### `python-rules/mock-without-spec`

`<name>` has no spec, so it answers any attribute and any call and keeps passing when the class changes.

- **Allowed form:** Give the stand-in the shape of what it replaces: `Mock(spec=Mailer)` or `create_autospec(Mailer, instance=True)` for a mock, `patch("shop.checkout.send", autospec=True)` or `new=` with a fake for a patch, or pass a hand-written fake.
- **Exception:** If this is intended, add `{"rule":"mock-without-spec","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-mocked-subject-in-test"></a>

### `python-rules/mocked-subject-in-test`

`<name>` is part of the module this test is named after, so the test replaces the code it should check.

- **Allowed form:** Run the real code: pass its collaborators in (a parameter, a constructor argument or a fixture) and give the test a fake of them, test a helper through the public function that calls it, and patch only what the module imports (`patch("shop.cart.requests.get")`).
- **Exception:** If this is intended, add `{"rule":"mocked-subject-in-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-module-level-mutable-state"></a>

### `python-rules/module-level-mutable-state`

`<name>` changes a module-level collection.

- **Allowed form:** Keep the state in an object that is created in the composition root and passed in, or build a new immutable value and return it. A registry filled once at import time (a decorator that adds the function to a table) is not run-time state; the exception route below covers its path.
- **Exception:** If this is intended, add `{"rule":"module-level-mutable-state","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-module-state-in-domain"></a>

### `python-rules/module-state-in-domain`

Domain code uses the module state `<name>`.

- **Allowed form:** Receive the state as a parameter and return the new value; the composition root creates the object and passes it in.
- **Exception:** If this is intended, add `{"rule":"module-state-in-domain","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-multiple-collection-joins"></a>

### `python-rules/multiple-collection-joins`

`<name>` and `undefined` are both collections joined into one query, so it returns every row of the first once for each row of the second.

- **Allowed form:** Load the collections with `selectinload`, one query each: `select(Order).options(selectinload(Order.lines), selectinload(Order.payments))`; one `joinedload` of a collection next to to-one relations stays one row per child. An exception fits only when both collections are known to stay small.
- **Exception:** If this is intended, add `{"rule":"multiple-collection-joins","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Java and Kotlin counterpart `JpaMultipleCollectionFetch`](java-pmd.md#pmd-jpamultiplecollectionfetch), [TypeScript and JavaScript counterpart `nitpicker/no-multiple-collection-joins`](typescript-nitpicker.md#eslint-nitpicker-no-multiple-collection-joins)

<a id="python-rules-negative-wait-in-test"></a>

### `python-rules/negative-wait-in-test`

`<name>` proves that nothing happens by waiting out its timeout, so the test is slow and depends on the delay.

- **Allowed form:** Check the state at once (`assert not event.is_set()`, `assert queue.empty()`), or control the clock or scheduler the code waits on, move it past the delay and assert right away.
- **Exception:** If this is intended, add `{"rule":"negative-wait-in-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-network-in-test"></a>

### `python-rules/network-in-test`

`<name>` reaches the network in a unit test.

- **Allowed form:** Replace the network with a fake: patch the client with `monkeypatch`, use `responses` or `respx`, or move the test to an `integration/` folder.
- **Exception:** If this is intended, add `{"rule":"network-in-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-no-inline-suppression"></a>

### `python-rules/no-inline-suppression`

Inline suppression `# <name>`.

- **Allowed form:** Remove the comment and fix the code.
- **Exception:** If this is intended, add `{"rule":"no-inline-suppression","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-no-type-check"></a>

### `python-rules/no-type-check`

`<name>` is excluded from type checking by `@no_type_check`.

- **Allowed form:** Remove the decorator and annotate the code so the checker can verify it.
- **Exception:** If this is intended, add `{"rule":"no-type-check","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-not-type-checking"></a>

### `python-rules/not-type-checking`

`<name>` hides code from the type checkers.

- **Allowed form:** Put the code in the normal flow; `if TYPE_CHECKING:` is only for imports that annotations need.
- **Exception:** If this is intended, add `{"rule":"not-type-checking","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-number-truthiness"></a>

### `python-rules/number-truthiness`

`<name>` is a number tested for truth, so `0` reads as false or missing.

- **Allowed form:** Compare the number: `count > 0`, `count != 0`, `index != -1`; test an optional number with `count is not None`, and default it with `count if count is not None else DEFAULT`. An exception fits only when `0` must take the same path as a missing value.
- **Exception:** If this is intended, add `{"rule":"number-truthiness","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-orm-query-logging"></a>

### `python-rules/orm-query-logging`

`<name>` logs every SQL query: the logs fill with personal data and bound values, and every query pays for the log line.

- **Allowed form:** Leave `echo` and the query loggers off and log slow queries instead: time queries with SQLAlchemy `before_cursor_execute`/`after_cursor_execute` events and log only the slow ones, or use the database's own slow-query log (`log_min_duration_statement` in PostgreSQL). A value switched on by an environment check (`echo=os.environ.get("ENV") != "production"`) still logs in every other environment. A local debugging script takes an exception.
- **Exception:** If this is intended, add `{"rule":"orm-query-logging","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Spring counterpart `spring/unsafe-diagnostics`](java-nitpicker.md#spring-unsafe-diagnostics)

<a id="python-rules-orm-schema-sync"></a>

### `python-rules/orm-schema-sync`

`<name>` lets the ORM create, alter or drop tables when the application runs, so a deploy can drop columns and their data and the schema drifts from the migrations.

- **Allowed form:** Change the schema with migrations instead: Alembic (`alembic upgrade head` in the deploy step), Django migrations, or Aerich for Tortoise; create tables in test fixtures, not in the application. An environment check around the call (`if settings.DEBUG:`) still changes the schema in every other environment. A local script outside the application, such as a seed, takes an exception.
- **Exception:** If this is intended, add `{"rule":"orm-schema-sync","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Spring counterpart `spring/ddl-auto`](java-nitpicker.md#spring-ddl-auto)

<a id="python-rules-parameter-mutation"></a>

### `python-rules/parameter-mutation`

`<name>` changes the argument the caller passed in.

- **Allowed form:** Build and return a new value (`[*items, item]`, `{**table, key: value}`), or copy the argument first (`items = [*items]`) when the function needs a working copy; do not hand a result back through a parameter.
- **Exception:** If this is intended, add `{"rule":"parameter-mutation","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-patch-misses-lookup"></a>

### `python-rules/patch-misses-lookup`

`<name>` is patched where it is defined, not where the code looks it up.

- **Allowed form:** Patch the name in the module that looks it up (`patch("shop.checkout.send")` after `from shop.mailer import send` in `shop.checkout`), or have that module import the module (`from shop import mailer`, then `mailer.send(...)`).
- **Exception:** If this is intended, add `{"rule":"patch-misses-lookup","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-pending-unsettled-on-close"></a>

### `python-rules/pending-unsettled-on-close`

`<name>()` clears the futures kept for pending requests without failing them, so every caller still awaiting one waits forever.

- **Allowed form:** In the close method, fail every pending future and then clear the dict: `for future in self._pending.values(): future.set_exception(ConnectionError("closed"))` (or `future.cancel()`), or hand the dict to a helper that does. An exception fits only when the futures are failed elsewhere before the object closes.
- **Exception:** If this is intended, add `{"rule":"pending-unsettled-on-close","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-process-env-access"></a>

### `python-rules/process-env-access`

`<name>` reads the process environment outside the composition root.

- **Allowed form:** Read the environment once in the composition root (`main.py`, `settings.py`, a `composition_root/` package) and pass the values in as arguments or a frozen settings dataclass.
- **Exception:** If this is intended, add `{"rule":"process-env-access","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-process-stream-access"></a>

### `python-rules/process-stream-access`

`<name>` reaches a standard stream outside the composition root.

- **Allowed form:** Take a `TextIO` parameter and write with `out.write(...)` or `print(..., file=out)`; the entry point (`main.py`, `cli.py`, a `[project.scripts]` target or the `if __name__ == "__main__":` block) passes `sys.stdout` or `sys.stderr`. For an entry point the gate does not recognize, list its file in `python.entryPoints`.
- **Exception:** If this is intended, add `{"rule":"process-stream-access","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-pydantic-any-field"></a>

### `python-rules/pydantic-any-field`

The pydantic field `<name>` is typed `Any`.

- **Allowed form:** Give the field its real type (`str`, `int`, a nested model, `Literal[...]`) or constrain it with `Field(min_length=1)` so the model validates it.
- **Exception:** If this is intended, add `{"rule":"pydantic-any-field","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-pydantic-boundary"></a>

### `python-rules/pydantic-boundary`

\<name> is imported outside an adapters/ package.

- **Allowed form:** Use pydantic only in an `adapters/` package to parse untrusted input (`Model.model_validate(data)`), and pass frozen dataclasses on from there.
- **Exception:** If this is intended, add `{"rule":"pydantic-boundary","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-pydantic-extra-allow"></a>

### `python-rules/pydantic-extra-allow`

The pydantic model `<name>` accepts unknown fields.

- **Allowed form:** Set `model_config = ConfigDict(extra="forbid")` (or leave the default `ignore`) and declare every field the model needs.
- **Exception:** If this is intended, add `{"rule":"pydantic-extra-allow","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-random-in-domain"></a>

### `python-rules/random-in-domain`

`<name>()` draws randomness in domain code.

- **Allowed form:** Take the value, a `random.Random` or an id factory as a parameter and create it in the composition root.
- **Exception:** If this is intended, add `{"rule":"random-in-domain","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-random-in-test"></a>

### `python-rules/random-in-test`

`<name>()` draws random values in a test.

- **Allowed form:** Use fixed values, or seed the generator (`random.Random(42)`) and pass it in, so a failure reproduces.
- **Exception:** If this is intended, add `{"rule":"random-in-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-real-clock-in-test"></a>

### `python-rules/real-clock-in-test`

`<name>()` reads the real clock in a test.

- **Allowed form:** Freeze or inject the time: pass a fixed aware `datetime` in (`datetime(2026, 1, 1, tzinfo=timezone.utc)`), use `freezegun` or `time_machine`, or patch the clock with `monkeypatch`.
- **Exception:** If this is intended, add `{"rule":"real-clock-in-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-regex-backtracking"></a>

### `python-rules/regex-backtracking`

This `re` pattern has nested or overlapping quantifiers that backtrack super-linearly on some inputs.

- **Allowed form:** See the guide: [Python preset guide](../python-preset.md).
- **Exception:** If this is intended, add `{"rule":"regex-backtracking","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-regex-part-defect"></a>

### `python-rules/regex-part-defect`

A part of this `re` pattern never changes what it matches, does not do what it looks like, or has a shorter form with the same meaning.

- **Allowed form:** See the guide: [Python preset guide](../python-preset.md).
- **Exception:** If this is intended, add `{"rule":"regex-part-defect","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-regex-unescaped-value"></a>

### `python-rules/regex-unescaped-value`

`<name>` is built into a regex pattern unescaped, so a `.`, `|`, `$` or other metacharacter in it changes what matches.

- **Allowed form:** Escape the value first (`re.compile(rf"^/{re.escape(name)}/\d+$")`), compare plain text with `in`, `startswith` or `==`, or pass a value that is meant as a whole pattern to `re.compile(pattern)` on its own.
- **Exception:** If this is intended, add `{"rule":"regex-unescaped-value","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-repeated-string-literal"></a>

### `python-rules/repeated-string-literal`

The string "\<name>" is repeated three times or more.

- **Allowed form:** Name it once as a constant (`PENDING = "pending"`), or as a member of an enum when the strings form a set of states.
- **Exception:** If this is intended, add `{"rule":"repeated-string-literal","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-retry-in-test"></a>

### `python-rules/retry-in-test`

`<name>` runs a failing test again.

- **Allowed form:** Remove the retry: a test that passes on a later attempt hides a flaky or racy test. Fix the cause, such as waiting on the condition instead of a fixed delay or isolating shared state.
- **Exception:** If this is intended, add `{"rule":"retry-in-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-reusable-object-per-call"></a>

### `python-rules/reusable-object-per-call`

`<name>` is built on every call, though it is safe to share once built and costly to build.

- **Allowed form:** Build it once at module level (`ORDERS = TypeAdapter(list[Order])`), in `__init__`, or in a `functools.cache` factory keyed by what varies.
- **Exception:** If this is intended, add `{"rule":"reusable-object-per-call","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-secret-in-log"></a>

### `python-rules/secret-in-log`

`<name>` is a secret and is passed to a log call.

- **Allowed form:** Log that it is set (`logger.info("token set: %s", token is not None)`) or a masked tail, never the value.
- **Exception:** If this is intended, add `{"rule":"secret-in-log","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-server-or-container-per-test"></a>

### `python-rules/server-or-container-per-test`

`<name>()` starts a container, server, process or git repository for each test.

- **Allowed form:** Start it once: a `scope="session"` or `scope="module"` fixture that resets its state between tests, or `setup_class`/`setUpClass`. Or test the logic against an in-memory implementation and keep the real transport for transport tests. An exception fits only when each test needs a fresh instance.
- **Exception:** If this is intended, add `{"rule":"server-or-container-per-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-service-locator-lookup"></a>

### `python-rules/service-locator-lookup`

`<name>` looks a service up in a dependency-injection container, which hides what this code needs and fails only when it runs, if the registration is missing.

- **Allowed form:** Take the dependency as an argument typed with the narrow protocol the code needs, and resolve it once in the composition root (`main.py`, a `composition_root/` package, a `create_app` factory, or a file listed in "layout.entryPoints"). `@inject` with `Provide[...]` is the allowed wiring, and a lookup in an `injector.Module` or `Provider` or inside a registration factory (`di[Mailer] = lambda di: Mailer(di[Config])`, `container.register(Mailer, factory=make_mailer)`) is composition code.
- **Exception:** If this is intended, add `{"rule":"service-locator-lookup","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-shared-test-state"></a>

### `python-rules/shared-test-state`

A test changes `<name>`, which every test of the module or class shares, so the tests depend on the order they run in.

- **Allowed form:** Build the state in the test or in a function-scoped fixture, or reset it before every test: `.clear()` or reassign it in an `autouse` fixture, `setup_method` or `setUp`. State built once in a session or module fixture is fine while the tests only read it.
- **Exception:** If this is intended, add `{"rule":"shared-test-state","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-shell-command"></a>

### `python-rules/shell-command`

`<name>` runs a command through a shell.

- **Allowed form:** Run the program directly with the arguments as a list and leave the shell out: `subprocess.run(["git", "status"], check=True)`; `shell=False` is the default.
- **Exception:** If this is intended, add `{"rule":"shell-command","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-simpler-boolean-logic"></a>

### `python-rules/simpler-boolean-logic`

Write this boolean logic in its simpler exact form: `<name>`.

- **Allowed form:** Drop the `not` and swap what it chose between (`if ready:` first, `b if ready else a`), or negate once: `not (a or b)` for `not a and not b`.
- **Exception:** If this is intended, add `{"rule":"simpler-boolean-logic","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-singular-and-plural-field"></a>

### `python-rules/singular-and-plural-field`

Optional fields `<item>` and `<items>` of `<name` are two ways to pass the same data.

- **Allowed form:** Keep the plural one and pass a single item as a one-element list.
- **Exception:** If this is intended, add `{"rule":"singular-and-plural-field","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-skipped-test-without-reason"></a>

### `python-rules/skipped-test-without-reason`

`<name>` skips a test without a reason.

- **Allowed form:** Skip on a real condition and give the reason: `@pytest.mark.skipif(sys.platform == "win32", reason="posix only")`, `pytest.importorskip("numpy")` or `if not has_gpu(): pytest.skip("needs a GPU")`; or fix or delete the test.
- **Exception:** If this is intended, add `{"rule":"skipped-test-without-reason","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-sleep-in-test"></a>

### `python-rules/sleep-in-test`

`<name>` waits for real time in a test.

- **Allowed form:** Control the clock instead of waiting: inject a fake clock or patch `time.sleep` with `monkeypatch`. To wait for a condition, poll it in a loop until a deadline (`while not ready():` with a `time.monotonic()` check and a short sleep) or use the library's wait helper, such as Playwright's `expect(locator).to_be_visible()`.
- **Exception:** If this is intended, add `{"rule":"sleep-in-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-sql-string-formatting"></a>

### `python-rules/sql-string-formatting`

`<name>` runs a query built by formatting a string.

- **Allowed form:** Pass the values as query parameters: `cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))`, `session.execute(text("SELECT * FROM users WHERE id = :id"), {"id": user_id})` in SQLAlchemy, `Model.objects.raw("... WHERE id = %s", [user_id])` in Django. Build placeholder lists from placeholders alone (`", ".join(["%s"] * len(ids))`) and optional filters as `conditions.append("name = %s")` joined with `" AND "`. A table or column name comes from a fixed lookup (`COLUMNS[key]` over a dict of constant names), a check against a constant set that stops otherwise (`if column not in ALLOWED: raise ValueError(column)`), a `Literal[...]` or `Enum` value, the schema (`table.name`, `model._meta.db_table`), or a quoting call (`psycopg.sql.Identifier(name)`, `dialect.identifier_preparer.quote(name)`).
- **Exception:** If this is intended, add `{"rule":"sql-string-formatting","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-streamed-rows-collected"></a>

### `python-rules/streamed-rows-collected`

`<name>` holds every row of a streamed query or server-side cursor at once, which is what streaming avoids and what runs out of memory on a large table.

- **Allowed form:** Work through a fixed-size batch inside the loop: append, and when `len(batch) >= 500` hand the batch on and `batch.clear()`; hand on the rest once after the loop. An exception fits only for a query that always returns few rows.
- **Exception:** If this is intended, add `{"rule":"streamed-rows-collected","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-stub-beside-source"></a>

### `python-rules/stub-beside-source`

`<name>` sits beside its source and replaces it for the checkers.

- **Allowed form:** Delete the `.pyi` file and annotate the `.py` file itself.
- **Exception:** If this is intended, add `{"rule":"stub-beside-source","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-subprocess-without-timeout"></a>

### `python-rules/subprocess-without-timeout`

`<name>` waits for a child process without a deadline, so a command that never exits hangs this code for good.

- **Allowed form:** Pass a timeout: `subprocess.run(args, timeout=30, check=True)`, `process.communicate(timeout=30)` or `process.wait(timeout=30)` (then kill the child on `TimeoutExpired`). Wrap an asyncio wait in `async with asyncio.timeout(30):` or `asyncio.wait_for(process.wait(), 30)`. A program whose purpose is to run the child to completion, such as a build wrapper, takes an exception.
- **Exception:** If this is intended, add `{"rule":"subprocess-without-timeout","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-swallowed-exception"></a>

### `python-rules/swallowed-exception`

`<name>` swallows the error: it only logs it or returns a default, and carries on.

- **Allowed form:** Re-raise it with its cause (`raise DomainError(...) from error`), return a failure result that carries the error (`return Rejected(str(error))`), or return the errors the function builds along with its result (`return results, errors`); logging alone is not handling. `contextlib.suppress(SpecificError)` ignores one expected error. In a test, use `pytest.raises(SpecificError)` (`self.assertRaises` in unittest).
- **Exception:** If this is intended, add `{"rule":"swallowed-exception","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-switched-off-test"></a>

### `python-rules/switched-off-test`

`<name>` switches a test off for good.

- **Allowed form:** Delete the test or make it run. A skip on a real condition is allowed: `@pytest.mark.skipif(sys.platform == "win32", reason="posix only")`, `pytest.importorskip("numpy")` or `@unittest.skipUnless(HAS_DATABASE, "needs the database")`.
- **Exception:** If this is intended, add `{"rule":"switched-off-test","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-task-outlives-resource"></a>

### `python-rules/task-outlives-resource`

`<name>`: the resource closes when its `with` block ends, while the child task can still use it.

- **Allowed form:** Open the resource around the whole task group, or inside the child task.
- **Exception:** If this is intended, add `{"rule":"task-outlives-resource","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-tautological-assert"></a>

### `python-rules/tautological-assert`

`<name>` can never fail.

- **Allowed form:** Assert on the result of the code under test: `assert total(order) == Decimal("12.50")`.
- **Exception:** If this is intended, add `{"rule":"tautological-assert","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-test-helper-in-source"></a>

### `python-rules/test-helper-in-source`

`<name>` is test support inside the production source.

- **Allowed form:** Move test helpers and fixtures into the tests folder (`tests/support/`, `conftest.py`) so they do not ship with the package. A library's public `testing` module is allowed when the package `__init__.py` imports it or lists it in `__all__`.
- **Exception:** If this is intended, add `{"rule":"test-helper-in-source","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-test-without-assertion"></a>

### `python-rules/test-without-assertion`

Test `<name>` has no assertion.

- **Allowed form:** Assert the outcome: `assert result == expected`, `with pytest.raises(SomeError):`, or call one of the assertion helpers the project tests use.
- **Exception:** If this is intended, add `{"rule":"test-without-assertion","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-time-unit-mismatch"></a>

### `python-rules/time-unit-mismatch`

`payload["exp"]` is in seconds and `time.time() * 1000` is in milliseconds, so the result is off by 1000x.

- **Allowed form:** See the guide: [Python preset guide](../python-preset.md).
- **Exception:** If this is intended, add `{"rule":"time-unit-mismatch","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-timeout-abandons-operation"></a>

### `python-rules/timeout-abandons-operation`

`<name>` returns as soon as the first task finishes, but the tasks still pending keep running: nothing cancels, awaits or hands them on.

- **Allowed form:** Cancel what is still pending (`for task in pending: task.cancel()`, then `await asyncio.gather(*pending, return_exceptions=True)`) or hand the set to an owner that does; or bound the work with `asyncio.wait_for(task, timeout)`, `async with asyncio.timeout(seconds):` or a `TaskGroup`, which cancel it.
- **Exception:** If this is intended, add `{"rule":"timeout-abandons-operation","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-timeout-scope-path-without-checkpoint"></a>

### `python-rules/timeout-scope-path-without-checkpoint`

`<name>` has a path that runs `` without reaching a checkpoint (an `await` that suspends, `async with` or `async for`), so its timeout or cancellation cannot interrupt that path.

- **Allowed form:** Reach a checkpoint on every path through the scope: await the slow work (`await asyncio.to_thread(work)`, `await trio.to_thread.run_sync(work)`, `await anyio.to_thread.run_sync(work)`), or add an explicit checkpoint before it (`await asyncio.sleep(0)`, `await trio.lowlevel.checkpoint()`, `await anyio.lowlevel.checkpoint()`), or move the checkpoint-free path out of the scope. A scope with no checkpoint at all is reported by Ruff ASYNC100.
- **Exception:** If this is intended, add `{"rule":"timeout-scope-path-without-checkpoint","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-tls-verification-off"></a>

### `python-rules/tls-verification-off`

`<name>` turns off TLS certificate verification, or lets the environment turn it off.

- **Allowed form:** Keep verification on in every environment and trust the certificate authority instead: `requests.get(url, verify="/etc/ssl/private-ca.pem", timeout=10)`, `ssl.create_default_context(cafile=ca_path)`, `tlsCAFile=ca_path` for MongoDB, or `REQUESTS_CA_BUNDLE` and `SSL_CERT_FILE` pointing at the bundle. A server that asks for optional client certificates uses `ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)` with `verify_mode = ssl.CERT_OPTIONAL`; a server context that loads its own certificate needs no `verify_mode = ssl.CERT_NONE` line: delete it.
- **Exception:** If this is intended, add `{"rule":"tls-verification-off","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-todo-without-issue"></a>

### `python-rules/todo-without-issue`

The task marker `<name>` has no issue.

- **Allowed form:** Name the issue right after the marker (`# TODO(#123): ...`, `# TODO PROJ-123: ...` or a link), or delete the comment and track the work in the issue tracker.
- **Exception:** If this is intended, add `{"rule":"todo-without-issue","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-tri-state-boolean"></a>

### `python-rules/tri-state-boolean`

`<name>` is a boolean that can also be `None`, a third state.

- **Allowed form:** Name the three states with an enum (`class Consent(Enum)` with `GRANTED`, `DENIED` and `UNKNOWN`), or take a keyword-only `bool` with a default (`*, urgent: bool = False`) when `None` only means false. A method that overrides a base class takes `@typing.override` and keeps the base signature.
- **Exception:** If this is intended, add `{"rule":"tri-state-boolean","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-type-cast"></a>

### `python-rules/type-cast`

`<name>` asserts a type without checking the value.

- **Allowed form:** Narrow the value with `isinstance` or `match`, or give it the correct type at its source.
- **Exception:** If this is intended, add `{"rule":"type-cast","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-unbounded-collection"></a>

### `python-rules/unbounded-collection`

`<name>()` adds to a long-lived collection that nothing removes from or bounds, so memory grows for the life of the process.

- **Allowed form:** Remove the entry when its request, session or run ends (`self._sessions.pop(session_id, None)` in a `finally` or the close method), bound the collection (`if len(self._cache) >= limit: ...` before the add, `collections.deque(maxlen=...)` or an LRU cache), or key a `weakref.WeakKeyDictionary` by the object. A registry filled at startup (literal keys, or an `__init__`, `init` or `register` method) is skipped. An exception fits only when the keys are a fixed finite set.
- **Exception:** If this is intended, add `{"rule":"unbounded-collection","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-unbounded-fan-out"></a>

### `python-rules/unbounded-fan-out`

`<name>` starts `<call>` for every element of `<collection>` at once.

- **Allowed form:** A large collection exhausts the remote service's connections or rate limit. Hold one `asyncio.Semaphore(8)` created outside the tasks with `async with limit:` around each call, gather fixed-size slices (`items[i : i + 20]`), or make one batch call when the API has one.
- **Exception:** If this is intended, add `{"rule":"unbounded-fan-out","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-unbounded-query-array"></a>

### `python-rules/unbounded-query-array`

`<name>` is expanded into the statement with one bound parameter per element (an `in_` list, or every column of every row of `insert().values(rows)`): an empty insert fails, a long list makes a slow statement, and PostgreSQL takes at most 65,535 bound parameters with a driver that binds on the server (asyncpg, psycopg 3).

- **Allowed form:** Return early when it is empty and split it into chunks (`for part in itertools.batched(ids, 1000):`), or send the whole list as one array parameter (`User.id == any_(bindparam("ids", ids, type_=ARRAY(Integer)))`); for rows, `session.execute(insert(User), rows)` lets SQLAlchemy batch them. An exception fits only a list that its callers bound, such as a request field with a maximum length.
- **Exception:** If this is intended, add `{"rule":"unbounded-query-array","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-unbounded-wait"></a>

### `python-rules/unbounded-wait`

`<name>` waits without a timeout, so a task that never finishes hangs this thread for good.

- **Allowed form:** Pass a timeout in seconds: `future.result(timeout=30)`, `concurrent.futures.wait(futures, timeout=30)`, `thread.join(timeout=30)` (then check `is_alive()`). A program whose purpose is to wait for the work to finish, such as a shutdown that joins the worker it just told to stop, takes an exception.
- **Exception:** If this is intended, add `{"rule":"unbounded-wait","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-unclosed-inline-resource"></a>

### `python-rules/unclosed-inline-resource`

`<name>` opens a file, socket or connection and uses it in the same expression, so nothing closes it.

- **Allowed form:** Open it in a `with` block (`with open(path, encoding="utf-8") as handle: data = json.load(handle)`), or read the whole file with `Path(path).read_text(encoding="utf-8")` or `read_bytes()`. Without `with`, only the garbage collector closes the handle: CPython does it when the last reference goes, PyPy later, an exception that keeps the frame alive holds it open, and Python warns with `ResourceWarning` when warnings are on (`-X dev`, pytest). `contextlib.closing(...)` and `ExitStack.enter_context(...)` also pass.
- **Exception:** If this is intended, add `{"rule":"unclosed-inline-resource","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-uncollected-tests"></a>

### `python-rules/uncollected-tests`

`<name>` defines tests that the test run does not collect.

- **Allowed form:** Name the file so pytest collects it (`test_*.py` or `*_test.py`), or add its pattern to `python_files` in the pytest configuration.
- **Exception:** If this is intended, add `{"rule":"uncollected-tests","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-unindexed-foreign-key"></a>

### `python-rules/unindexed-foreign-key`

The foreign key `<name>` has no index that starts with it, so every delete of a referenced row and every lookup by it scans the table.

- **Allowed form:** Add `index=True` to the column (SQLAlchemy `mapped_column`/`Column`, SQLModel `Field`), an `Index` whose first column is it, or drop `db_index=False` (Django) or list the field first in `Meta.indexes`. Only MySQL indexes a foreign-key column by itself; PostgreSQL, SQL Server and SQLite do not. An exception fits only when the table is known to stay small.
- **Exception:** If this is intended, add `{"rule":"unindexed-foreign-key","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.
- **See also:** [Java and Kotlin counterpart `JpaUnindexedForeignKey`](java-pmd.md#pmd-jpaunindexedforeignkey), [TypeScript and JavaScript counterpart `nitpicker/no-unindexed-foreign-key`](typescript-nitpicker.md#eslint-nitpicker-no-unindexed-foreign-key), [Go counterpart `go-rules/unindexed-foreign-key`](../go-preset.md#own-rules)

<a id="python-rules-unmapped-exception"></a>

### `python-rules/unmapped-exception`

\<name>, and no exception handler maps it to a status, so the client gets a 500.

- **Allowed form:** Register a handler for it (`@app.exception_handler(OrderNotFound)` returning a 404) or derive it from `HTTPException` with the status that fits. A handler for `Exception` counts when it checks the class with `isinstance`. An exception fits a class that only signals a server fault.
- **Exception:** If this is intended, add `{"rule":"unmapped-exception","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-unordered-query"></a>

### `python-rules/unordered-query`

`<name>` takes a page of rows (`limit`, `offset`, a queryset slice, SQL `LIMIT`, `OFFSET` or `FETCH`) or builds an `array_agg`/`json_agg` list with no ORDER BY, so which rows come back, and in which order, is up to the database and can change between runs.

- **Allowed form:** Order on a unique key, or add a tie-breaker after a non-unique key: `select(User).order_by(User.created.desc(), User.id).limit(20)`, `Order.objects.order_by("-created", "id")[:20]` (or `ordering` in the model's `Meta`), `order by created desc, id` in SQL text, `func.array_agg(aggregate_order_by(t.c.name, t.c.name))` or `ArrayAgg("name", order_by="name")`. `limit(1)` is fine when the query selects only a constant or a count. An exception fits only a query whose rows come back in one order anyway, or a nested list that is a set whose callers never depend on its order.
- **Exception:** If this is intended, add `{"rule":"unordered-query","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-unsafe-deserialization"></a>

### `python-rules/unsafe-deserialization`

`<name>` can build arbitrary Python objects from the document.

- **Allowed form:** Load YAML with `yaml.safe_load(text)`, `yaml.safe_load_all(text)` for several documents, or `Loader=yaml.SafeLoader` (or a subclass of it).
- **Exception:** If this is intended, add `{"rule":"unsafe-deserialization","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-unsafe-path-join"></a>

### `python-rules/unsafe-path-join`

`<name>()` builds a file path from its input without a containment check.

- **Allowed form:** Resolve the path and check it stays inside the base before using it: `target = (base / name).resolve()`, then `if not target.is_relative_to(base.resolve()): raise ValueError(...)`.
- **Exception:** If this is intended, add `{"rule":"unsafe-path-join","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-unshielded-cleanup-await"></a>

### `python-rules/unshielded-cleanup-await`

`<name>` can be cancelled before the cleanup finishes, so the resource may stay open.

- **Allowed form:** Run the cleanup in a shielded scope with a deadline: `with trio.CancelScope(deadline=trio.current_time() + 5, shield=True): await resource.aclose()` (`anyio.CancelScope(deadline=anyio.current_time() + 5, shield=True)` in AnyIO; `move_on_after(5, shield=True)` needs Trio 0.27 or later). A shield without a deadline can hang shutdown.
- **Exception:** If this is intended, add `{"rule":"unshielded-cleanup-await","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-untested-round-trip"></a>

### `python-rules/untested-round-trip`

\<name> turn values into each other, and no test runs one on the output of the other, so a field that one of them drops or garbles goes unnoticed.

- **Allowed form:** Add a test that calls both on the same value: `assert Order.from_dict(order.to_dict()) == order`, with values that need escaping or mapping (quotes, newlines, non-ASCII, `None` fields).
- **Exception:** If this is intended, add `{"rule":"untested-round-trip","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-unused-option"></a>

### `python-rules/unused-option`

Option \<name> is never set. Remove it, or set it from a real call (tests do not count).

- **Allowed form:** See the guide: [Python preset guide](../python-preset.md).
- **Exception:** If this is intended, add `{"rule":"unused-option","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="python-rules-weak-assertion"></a>

### `python-rules/weak-assertion`

`<name>` passes for almost any value.

- **Allowed form:** Assert the exact value, contents or length, or the call arguments: `assert rows == expected`, `m.assert_called_once_with(order_id)`.
- **Exception:** If this is intended, add `{"rule":"weak-assertion","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-rules-weak-hmac"></a>

### `python-rules/weak-hmac`

`<name>` signs with HMAC-MD5, which is no longer approved for message authentication.

- **Allowed form:** Sign with `hmac.new(key, message, hashlib.sha256)` and compare with `hmac.compare_digest`; HMAC-SHA1 is accepted where a protocol fixes it (TOTP, OAuth 1.0a).
- **Exception:** If this is intended, add `{"rule":"weak-hmac","paths":["<path>"],"reason":"..."}` to "python.exceptions" in nitpicker.config.json.

<a id="python-no-tests-ran"></a>

### `python/no-tests-ran`

The test run collected no tests.

- **Why it is on:** Coverage, CRAP and mutation results mean nothing when no test ran.
- **Allowed form:** Keep the project tests, or restore the ones the change removed.
- **Exception:** It has no exception: restore the tests.

<a id="ruff-format-format"></a>

### `ruff-format/format`

A file is not formatted with the formatter of the project.

- **Printed as:** `ruff-format/format` and `black/format`
- **Why it is on:** One layout for every file, so that reviews are about the code and not its formatting.
- **Allowed form:** Format the file with the formatter (`python.formatter`: ruff or black).
- **Exception:** It has no exception: format the file.
