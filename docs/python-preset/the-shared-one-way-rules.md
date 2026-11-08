# The shared one-way rules

Part of the [Python preset guide](../python-preset.md).

These rules bring the Python preset to the rules the TypeScript and Java presets enforce. Each
finding names the allowed form first and ends with the usual exception sentence (`python.exceptions`, or `exceptions` for the shared rules). The
rules marked "script" are `python-rules` findings of `nitpicker_rules.py` (one module per concern
under `languages/python/rules/`: `checks`, `boundary`, `smells`, `honesty`); the others are ruff
rules. Rules that are not enforced because they flag idiomatic code with no clean alternative
are listed at the end.

| Concern                  | Allowed form                                                                                                                                                                         | Rule                                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Logging                  | `logger.info("Loaded %s", count)`, `logger.warning`, `logger.exception` (structlog, loguru: see below)                                                                               | ruff `G001`-`G004`, `G010`, `G101`, `G201`, `G202`, `TRY400`, `TRY401`                                                                                                                                                                     |
| Environment              | read once in a composition root, pass values in                                                                                                                                      | `process-env-access` (script)                                                                                                                                                                                                              |
| Shell                    | a list: `subprocess.run(["git", "status"], check=True)`                                                                                                                              | `shell-command` (script), ruff `S602`, `S604`, `S605`, `S609`                                                                                                                                                                              |
| SQL                      | parameters: `cursor.execute("select * from t where id = %s", (id,))`; placeholder lists, fixed lookups, `Literal`/`Enum` names, `sql.Identifier`                                     | `sql-string-formatting` (script), ruff `S610`, `S611`                                                                                                                                                                                      |
| Path traversal           | `target = (base / name).resolve()`, then `target.is_relative_to(base)`                                                                                                               | `unsafe-path-join` (script)                                                                                                                                                                                                                |
| Magic numbers            | a named constant                                                                                                                                                                     | ruff `PLR2004`                                                                                                                                                                                                                             |
| Naming                   | PEP 8: `CapWords`, `snake_case`, `UPPER_SNAKE_CASE`, `...Error`                                                                                                                      | ruff `N`                                                                                                                                                                                                                                   |
| Boundary                 | parse untrusted data once with the project's validator (pydantic by default) in `adapters/`                                                                                          | `handwritten-boundary-guard` (script)                                                                                                                                                                                                      |
| Types in the domain      | real types, `Protocol`, frozen dataclasses                                                                                                                                           | `any-in-domain`, `pydantic-any-field`, `pydantic-extra-allow` (script)                                                                                                                                                                     |
| Type checking            | a concrete type, `Protocol`, `TypeVar`, `ParamSpec`, `object` narrowed with `isinstance`; no `typing.cast`, no `Any`                                                                 | `type-cast`, `explicit-any` (script)                                                                                                                                                                                                       |
| Pure domain              | clock, ids, random values and results passed in; ports implemented in `adapters/`; no logger or module state                                                                         | `clock-now`, `random-in-domain`, `io-in-domain`, `logger-in-domain`, `module-state-in-domain` (script)                                                                                                                                     |
| Module state             | state in an object made in the composition root                                                                                                                                      | `module-level-mutable-state` (script), ruff `PLW0602`, `PLW0603`                                                                                                                                                                           |
| Import-time effects      | work done in a function the composition root calls, or under `if __name__ == "__main__":`                                                                                            | `import-time-effect` (script)                                                                                                                                                                                                              |
| Risky APIs               | JSON instead of pickle or marshal, `copy.deepcopy` to clone, a specific exception class                                                                                              | ruff `S301`, `S302`, `TRY002`, `TRY004`, `TRY201`, `TRY203`                                                                                                                                                                                |
| Deserialization          | `yaml.safe_load`, `torch.load(path, weights_only=True)`, `numpy.load` without `allow_pickle`                                                                                         | ruff `S506`, `unsafe-deserialization` (script)                                                                                                                                                                                             |
| Deprecated APIs          | the replacement the deprecation notice names                                                                                                                                         | mypy `deprecated`, pyright and basedpyright `reportDeprecated`                                                                                                                                                                             |
| Repeated strings         | a constant or enum member                                                                                                                                                            | `repeated-string-literal` (script)                                                                                                                                                                                                         |
| Unused arguments         | remove the argument; `@override` on an override; a `_` prefix when a callback signature is fixed                                                                                     | ruff `ARG001`-`ARG005`                                                                                                                                                                                                                     |
| Generic names            | a name for the job (`price_rounding.py`, `OrderRepository`)                                                                                                                          | `generic-name` (script)                                                                                                                                                                                                                    |
| Secrets                  | read from the environment; log only that a secret is set                                                                                                                             | `hardcoded-secret`, `credential-shape`, `secret-in-log` (script)                                                                                                                                                                           |
| Datetimes                | a datetime with a zone: `datetime.now(tz=timezone.utc)`, `datetime.fromtimestamp(ts, tz=timezone.utc)`, `%z` when parsing an instant, `date.fromisoformat(text)` for a calendar date | ruff `DTZ001`-`DTZ007`, `DTZ011`, `DTZ012`, `DTZ901`                                                                                                                                                                                       |
| Boolean flags            | keyword-only (`def send(message, *, urgent=False)`), two functions or an enum                                                                                                        | `boolean-flag-parameter` (script)                                                                                                                                                                                                          |
| Tri-state booleans       | an enum that names the three states, or a keyword-only `bool` with a default (`*, urgent=False`)                                                                                     | `tri-state-boolean` (script)                                                                                                                                                                                                               |
| ORM schema at startup    | migrations: Alembic `alembic upgrade head` in the deploy step, Django migrations, Aerich                                                                                             | `orm-schema-sync` (script)                                                                                                                                                                                                                 |
| ORM query logging        | `echo` and the query loggers off; slow queries logged from cursor events or by the database                                                                                          | `orm-query-logging` (script)                                                                                                                                                                                                               |
| Defaulting parameters    | `limit if limit is not None else DEFAULT_LIMIT`                                                                                                                                      | `falsy-default` (script)                                                                                                                                                                                                                   |
| Testing numbers          | `count > 0`, `index != -1`, `count is not None`                                                                                                                                      | `number-truthiness` (script)                                                                                                                                                                                                               |
| Changing an argument     | build and return a new value, or copy the argument first                                                                                                                             | `parameter-mutation` (script)                                                                                                                                                                                                              |
| Compatibility shims      | change every caller in the same change and delete the old name                                                                                                                       | `compatibility-shim` (script)                                                                                                                                                                                                              |
| Values in regex patterns | `re.escape(value)` inside a pattern, `in`/`startswith`/`==` for plain text, `re.compile(pattern)` with a whole pattern                                                               | `regex-unescaped-value` (script)                                                                                                                                                                                                           |
| Input or output per item | one batch call, or `asyncio.gather` bounded by a shared `asyncio.Semaphore`                                                                                                          | `io-in-loop` (script)                                                                                                                                                                                                                      |
| Concurrent remote calls  | `asyncio.Semaphore` acquired in the task, or chunks of fixed size, or one batch call                                                                                                 | `unbounded-fan-out` (script)                                                                                                                                                                                                               |
| Task lifetimes           | open the resource around the whole task group, or inside the child; await the task first                                                                                             | `task-outlives-resource` (script)                                                                                                                                                                                                          |
| Trio/AnyIO cleanup       | `with trio.CancelScope(deadline=trio.current_time() + 5, shield=True): await resource.aclose()`                                                                                      | `unshielded-cleanup-await` (script)                                                                                                                                                                                                        |
| Files and connections    | `with open(path) as handle:`, `Path(path).read_text()`, `contextlib.closing(...)`                                                                                                    | `unclosed-inline-resource` (script), `SIM115`                                                                                                                                                                                              |
| Task markers             | `# TODO(#123): ...` with an issue                                                                                                                                                    | `todo-without-issue` (script)                                                                                                                                                                                                              |
| Commented-out code       | delete it                                                                                                                                                                            | ruff `ERA001`                                                                                                                                                                                                                              |
| Security sinks           | parameterized queries, `sha256`, verified TLS, a timeout, `yaml.safe_load`, `defusedxml`                                                                                             | ruff `S` (see below)                                                                                                                                                                                                                       |
| TLS                      | verification on in every environment; a CA bundle (`verify=ca_path`, `cafile=`, `tlsCAFile=`)                                                                                        | ruff `S501`, `S323`, `tls-verification-off` (script)                                                                                                                                                                                       |
| Signatures               | `hmac.new(key, message, hashlib.sha256)`; HMAC-SHA1 where a protocol fixes it                                                                                                        | ruff `S324`, `S303`, `weak-hmac` (script)                                                                                                                                                                                                  |
| Timeouts                 | `timeout=10` on every request, `urlopen` and plain `requests.Session` call; never `timeout=None`                                                                                     | ruff `S113`, `http-without-timeout` (script)                                                                                                                                                                                               |
| Child processes          | `subprocess.run(args, timeout=30, check=True)`, `communicate(timeout=30)`, asyncio waits in `asyncio.timeout(30)`                                                                    |
| Test honesty             | a reason on every skip, no sleeping, no tautologies, fixed time and seeded random values, no network, no leaked global state                                                         | ruff `PT`, `skipped-test-without-reason`, `sleep-in-test`, `negative-wait-in-test`, `mocked-subject-in-test`, `tautological-assert`, `real-clock-in-test`, `random-in-test`, `network-in-test`, `server-or-container-per-test`, `global-state-leak-in-test` (script) |
| Test layout              | tests in files pytest collects; helpers in the tests folder                                                                                                                          | `uncollected-tests`, `test-helper-in-source` (script)                                                                                                                                                                                      |

`type-cast` rejects `typing.cast` (and `typing_extensions.cast`) as a call or as a value
(`partial(cast, int)`); `explicit-any` rejects every explicit `Any` of those modules. Both apply in
source and in tests, as the TypeScript preset bans `as` and `any` in tests too. The finding is named
by what it types: `f(a)`, `f(return)`, `Model.field`, `Alias`, or `cast(str) in f`, so a finding
added above another does not renumber it; one annotation gives one finding however many `Any` it holds
(`dict[str, Any] | list[Any]`), and `cast(Any, value)` is one `type-cast` finding. The allowed forms
are the concrete type, a `Protocol`, a `TypeVar`, a `ParamSpec` for a wrapper's `*args` and `**kwargs`,
and `object` narrowed with `isinstance` or `match` (`dict[str, object]`, `Callable[..., object]`);
untrusted input is parsed once in `adapters/` (the cast message names it when the target is a
container). Both rules take `python.exceptions` entries with paths and a reason. ruff's `ANN401` is
not selected, since `explicit-any` covers the same `Any` in every position.

- An `Any` inside a node that `any-in-domain` or `pydantic-any-field` already reports (the whole
  annotation, also over several lines) is not reported again, so one exception for the first rule
  covers the `explicit-any` on that node too.
- The implementation signature of a function that has `@overload` siblings is not checked: callers
  see the overloads, which are.
- `__getattr__`, `Callable[..., Any]` and test mocks are reported like any other `Any`; write
  `Callable[..., object]` and a typed fake.
- Resolution is lexical and conservative: a reassigned or ambiguous imported name (a comprehension
  variable, a `match` capture, a parameter) is not assumed to refer to typing, while `typing` and
  `typing_extensions` count as the same module (`try: from typing import cast` /
  `except ImportError: from typing_extensions import cast`). Dynamic imports, wildcard imports (ruff
  `F403` bans them), re-exports and arbitrary assignment aliases are not followed.
- Annotation strings are parsed as expressions; `Literal` string values and `Annotated` metadata are
  data, not type references. PEP 695/696 type-parameter bounds and defaults, class keywords and
  subscript targets are read. Unused imports alone do not produce these findings (ruff handles unused
  imports), and standalone `.pyi` stubs are not read.

Details that are decisions rather than the table:

- `PLR2004` allows the same numbers as the TypeScript `no-magic-numbers` (`-1`, `0`, `1`, `2`, `10`,
  `100`, `1000`): findings for them are dropped after ruff runs (`rules/filters/ruff-allowed-forms.mjs`),
  because ruff has no setting for it. Ruff already allows strings and bytes.
- `S602`, `S604` and `S605` with a command that is a plain string literal are dropped too (ruff
  marks them "seems safe"): a fixed command cannot be injected. A command built from a variable or
  an f-string is reported. `S603` and `S607` (a subprocess call at all) and `S606` are not
  selected: running a program with a list of arguments is the allowed form.
- `process-env-access` reports `os.environ`, `os.getenv`, `os.putenv` and the related names (`posix.environ`,
  `dotenv_values`, `getattr(os, "environ")`), also through `from os import environ` and import
  aliases, once per site in every non-test file that is not a composition root. A composition root
  is a file the program starts from or wires together: named `main`, `__main__`, `server`,
  `composition_root`, `manage`, `wsgi`, `asgi`, `cli`, `app`, `application`, `celery`, `bootstrap` or
  `worker`; named like a configuration module (`config`, `settings`, `conf`, `*_config`, `*_settings`,
  `settings_*`); `tasks`, `fabfile`, `noxfile`, `setup` or `conftest` at the top level; in a
  `composition_root`, `settings`, `config` or `conf` folder; an alembic `env.py` (a `script.py.mako`
  beside it); a file that defines `create_app`, `make_app`, `build_app` or a similar factory; a
  module named by a script or plugin entry point of `pyproject.toml` (`[project.scripts]`,
  `[project.entry-points]`, poetry scripts and plugins, flit), `setup.cfg` or `setup.py`; or a file
  matched by `python.entryPoints`.
  Nothing under a `domain` folder is a composition root.
- `shell-command` reports running a command through a shell: `shell=True` or a `shell=` value that
  is not a literal (also from `**{"shell": True}`), a list starting with `sh`, `bash`, `cmd`,
  `powershell` and the other shells followed by `-c`, `/c` or a similar flag, and the `subprocess`,
  `os.exec*`, `os.spawn*`, `pty.spawn` and `asyncio.create_subprocess_*` calls (also
  `create_subprocess_shell`). A list of arguments, or a fixed command string that ruff already
  accepts, is the allowed form. Not in tests.
- `subprocess-without-timeout` reports waiting for a child process without a deadline:
  `subprocess.run`, `call`, `check_call` and `check_output` without `timeout=` or with `timeout=None`
  (also through a `**options` dict and a `functools.partial`, reported where the partial is called),
  `subprocess.getoutput` and `getstatusoutput` (they take no timeout), `wait()` and `communicate()`
  without a timeout on a `subprocess.Popen` (a chain, a local, a `with` target or a `self.` attribute
  set in the class), and `wait()` or `communicate()` on an `asyncio.create_subprocess_exec`/`_shell` or
  `anyio.open_process` process and `anyio.run_process`/`trio.run_process` outside a deadline in the
  same function: `asyncio.timeout`, `asyncio.timeout_at`, `async_timeout.timeout`,
  `anyio.fail_after`/`move_on_after`, the trio equivalents, or a call wrapped (at any depth) in
  `asyncio.wait_for(..., timeout)` or `asyncio.wait(..., timeout=...)`, each with a value other than
  `None`. A wait held in a variable and passed to `wait_for` later, a Popen returned by a project
  helper, and a function passed to `run_in_executor` by reference are not followed. A call with
  `**kwargs` whose keys are unknown is not reported. Not in tests or test support, where the test run
  has its own limits. A program whose purpose is to run a child to completion, such as a build
  wrapper, takes an exception.
- `sql-string-formatting` reports SQL text built at run time that reaches a query call. A value is
  built when an f-string, `%`, `+`, `+=`, `.format`, `.format_map`, `string.Template(...).substitute` or
  `.join` puts a piece into it that is not provably inert, followed through local names, parameter
  defaults, module constants, class attributes and `self.x` set in the class (or a dataclass field),
  attributes of a project module (`settings.TABLE`), constants and helper functions imported from other
  project modules (with the call's arguments bound to the helper's parameters), comprehensions and lists
  filled by `append`/`extend`. Inert pieces are literals, numbers (`int(x)`, `len(ids)`), placeholder
  lists built from placeholders alone (`", ".join(["%s"] * len(ids))`, `"?" * n`, `("%s" for _ in ids)`,
  rows such as `"(%s, %s)"`), optional filters whose every `append` is constant text
  (`conditions.append("name = %s")` joined with `" AND "`), a subscript or `.get` of a dict, tuple or list of
  constant names (`COLUMNS[key]`), a loop over such a tuple or over the keys or values of a constant dict
  (also `MappingProxyType`, `frozenset` and `sorted` of one), the counter of `enumerate` (`f"${n}"`), a name
  checked against a constant collection before use (`if column not in ALLOWED: raise ...`, also `return`,
  `continue` or `break`, an enclosing `if column in ALLOWED:` and a comprehension filter), a parameter or a
  pydantic or dataclass field annotated `Literal[...]`, `int` or an `Enum`/`StrEnum` class of the project
  (and `.value`; a union counts only when every member does), a Django `_meta.db_table`, `get_field(...)`
  and `concrete_fields` columns, SQLAlchemy metadata (`__tablename__`, `Table("name", ...)` and its `.name`,
  `.c`, `.columns`, `metadata.tables`, `sorted_tables`, `inspect(Model).columns`), quoting calls
  (`quote_name`, `quote_ident`, `escape_identifier`, `dialect.identifier_preparer.quote`), psycopg
  `sql.Identifier`, `sql.Literal` and `sql.Placeholder`, and rows from `cursor.mogrify`; anything else,
  including a parameter or an unknown call, is not. The query calls are matched by name, as in the
  TypeScript rule: any name containing `query`, `sql` or `execute` (`execute`, `executemany`, `run_sql`,
  `read_sql`, `exec_driver_sql`, but not `execute_command` or `to_sql`), a name starting with `fetch`,
  `prepare`, `mogrify`, `raw`, `text`, `exec` and the `copy_*` calls, also through an alias
  (`run = cursor.execute`), `getattr(cursor, "execute")` and `functools.partial`, plus psycopg2
  `execute_values`/`execute_batch`. The static text must look like SQL: a statement (`SELECT`, `INSERT`,
  `UPDATE`, `DELETE`, `WITH`, `MERGE`, and DDL: `CREATE`, `ALTER`, `DROP`, `TRUNCATE`), or a clause in SQL
  shape (`WHERE name =`, `ORDER BY`, `LIMIT`, `SET x =`); a lone upper-case `AND`, `OR`, `IN` or `ON`, as in
  a search query, is not SQL. The raw builders of query libraries
  report any built piece, since their argument is SQL by definition: SQLAlchemy `text` and `literal_column`
  (also inside `.where(...)`, `.order_by(...)`), peewee `SQL` and psycopg `sql.SQL` (and `sql.SQL(value)` as
  an argument of `sql.SQL(...).format`, while `.format` on a `sql.SQL` with `sql.Identifier`/`sql.Literal`
  is the safe composition). A project function or method that passes one of its parameters (positional or
  keyword-only) straight to a query call is a wrapper, and its call sites are checked too (two levels). The
  advice names the placeholder style of the project's driver, read from its dependencies: `$1` for asyncpg,
  `?` for aiosqlite, `:name` for `databases`, `%s` otherwise. Django `.extra` and `RawSQL` are left to
  ruff `S610` and `S611`, which report them already. Prose, log and exception text with SQL words never
  reaches a query call and passes. It replaces ruff's `S608`, which flags every string that looks like SQL.
- `tls-verification-off` reports what ruff `S501` and `S323` miss: `verify=` on `requests`, `httpx`,
  `boto3`, `aiohttp` and session or client calls when the value can be `False` (a condition such as
  `verify=not DEBUG`, a comparison with the environment such as `os.environ.get("X") != "0"`, `bool(...)`,
  `strtobool`, `env.bool`, a conditional expression with a `False` branch, an `or` whose last operand can be
  `False` or an `and` whose operands can, or a name, parameter default, class attribute or imported
  constant bound to one of those; `ca or True` and `env or certifi.where()` cannot be `False` and pass),
  also through an options dict (a literal, `dict(...)`, one built in steps, `**options`) and
  `functools.partial`, and a literal `False` on calls `S501` does not cover (a session, `boto3`);
  `session.verify = False` and the same conditions; `ssl._create_default_https_context =
ssl._create_unverified_context`; `check_hostname = False` and `verify_mode = ssl.CERT_NONE` on a client
  context (also `ssl.VerifyMode.CERT_NONE` and `0`, and through `setattr`); urllib3 `cert_reqs="CERT_NONE"`
  and `assert_hostname=False`; `cert_reqs`/`ssl_cert_reqs` set to `CERT_NONE` (and redis
  `ssl_cert_reqs=None`) in calls and option dicts (websocket `sslopt`); aiohttp `ssl=False` (also a name
  bound to it) and `verify_ssl=False`; Elasticsearch and OpenSearch `verify_certs=False` and
  `ssl_assert_hostname=False`, kafka `ssl_check_hostname=False`, ldap3 `Tls(validate=CERT_NONE)`, docker
  `TLSConfig(verify=False)` and minio `cert_check=False`; Playwright `ignore_https_errors=True`, Selenium
  `acceptInsecureCerts` (a capability or `accept_insecure_certs = True`) and the browser flag
  `--ignore-certificate-errors`; MongoDB `tlsAllowInvalidCertificates`, `tlsAllowInvalidHostnames`,
  `tlsInsecure` set to a value that can be `True`, also in a connection URI, including one built with an
  f-string or `+`; and environment switches set in code or for child processes (`PYTHONHTTPSVERIFY=0`, an
  empty `CURL_CA_BUNDLE` or `REQUESTS_CA_BUNDLE`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, `GIT_SSL_NO_VERIFY`). A
  switch behind an explicit command-line flag (`verify=not args.insecure`) is reported too; a project that
  wants such a flag lifts the rule for its path with `python.exceptions`. A server context
  (`ssl.Purpose.CLIENT_AUTH`, `PROTOCOL_TLS_SERVER`, `server_side=True`, also held on `self.context`, and
  uvicorn and similar servers) and a server option dict (one that sets `certfile`,
  `keyfile`, `ssl_certfile` or `ssl_keyfile`) pass: a server that asks for optional client certificates
  sets `CERT_OPTIONAL`, which is never reported. A literal `verify=False` on a
  module-level `requests` or `httpx` call is left to `S501`, so one site gives one finding. A `verify=`
  read from an attribute (`settings.CA_BUNDLE`) is not reported, since it can be a path. Text that mentions
  the settings (a warning, help text) is not read.
- `weak-hmac` reports HMAC with MD5 (or MD4, MD2): `hmac.new`, `hmac.HMAC` and `hmac.digest` with
  `hashlib.md5`, `"md5"`, a lambda returning one, `hashlib.new("md5")`, an import alias, a parameter default,
  a class attribute or a constant bound to one, also from another module and through `functools.partial`,
  pycryptodome `HMAC.new(..., digestmod=MD5)` and cryptography `hmac.HMAC(key, hashes.MD5())`. HMAC-SHA1 passes: its
  security does not rest on collision resistance, and TOTP, HOTP and OAuth 1.0a fix it. Ruff's `S324`
  does not look into `hmac`, and `hashlib.md5(..., usedforsecurity=False)` passes `S324` already; ruff's
  `S303` reports `hashes.SHA1()` and `hashes.MD5()` inside a cryptography `HMAC(...)`, so those findings are
  dropped after ruff runs, leaving HMAC-SHA1 allowed and HMAC-MD5 reported once, with the HMAC message. The
  rules script finds those sites from the syntax tree (an aliased `HMAC`, a hash held in a variable) and
  lists them in `rules-allowances.json`; it also lists SHA-1 in RSA-OAEP and `MGF1`
  (`padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA1()), algorithm=hashes.SHA1(), ...)`), which rests on
  no collision resistance either. `hashes.Hash(hashes.SHA1())` stays an `S303` finding.
- `http-without-timeout` reports what ruff `S113` (module-level `requests` and `httpx` calls) misses:
  `urllib.request.urlopen` and an opener's `open` without a timeout, `http.client.HTTPConnection` and
  `HTTPSConnection` without one, a call on a plain `requests.Session()` (a local, a `with` target, a chain, a
  class attribute, a `self.` attribute set or annotated in the class, a dataclass field, or a module
  attribute of a project module) without `timeout=`, `timeout=None` (also through a constant such as
  `TIMEOUT = None`) on such a session or an httpx client, `getattr(session, method)(...)`,
  `functools.partial(requests.get, ...)` without a timeout, a urllib3 `PoolManager` or `urllib3.request`
  without one (urllib3 has no default), and an `aiohttp.ClientTimeout` that bounds nothing (no `total`,
  `connect`, `sock_read` or `sock_connect`, or each of them `None`, as in `ClientTimeout(total=None)`). `httpx` without a timeout passes: it has a 5 second default, and
  `S113` reports only an explicit `None`. `aiohttp.ClientSession` passes: its default `ClientTimeout` ends a
  request after 5 minutes. A project factory or `Session` subclass passes only when it sets a timeout: it
  mounts a timeout adapter on that same session in the same scope (a plain `HTTPAdapter` sets none),
  overrides `request` or `send` to set one, or binds `request` with `functools.partial(..., timeout=...)`.
  A call with `**kwargs` whose keys are unknown is not reported; `urlopen` is not reported when production
  code calls `socket.setdefaulttimeout` with a number.
- `unsafe-deserialization` reports what ruff `S301`, `S302` and `S506` miss: `yaml.unsafe_load`,
  `yaml.full_load` and their `_all` forms, `yaml.load_all` without a safe loader (`SafeLoader`, `CSafeLoader`,
  `BaseLoader` or a project class deriving from one at any depth; `S506` covers `yaml.load` only, and its
  finding is dropped when the loader is such a class), ruamel `YAML(typ="unsafe")` (also `y.typ = "unsafe"`
  set afterwards), `torch.load` without `weights_only` bound to `True` (a literal or a constant; torch 2.6
  made it the default, and the explicit form holds on every version), `numpy.load(..., allow_pickle=True)`,
  the pickle-based `joblib.load`, `cloudpickle.load` and `cloudpickle.loads`, keras and `tf.keras`
  `load_model(..., safe_mode=False)` and lxml `XMLParser(resolve_entities=True)` or `no_network=False`,
  also through an options dict or `functools.partial`. `jsonpickle.decode`,
  `dill`, `shelve` and `pandas.read_pickle` are `S301` findings already. A pickle round trip used to copy a
  value is an `S301` finding whose advice names `copy.deepcopy(value)`.
- `clock-now`, `random-in-domain`, `io-in-domain`, `logger-in-domain`, `module-state-in-domain` and
  `any-in-domain` apply to a directory named `domain` anywhere in the path (not tests). `io-in-domain`
  reports `open`, `input`, `time.sleep`, `os.system`, `os.popen`, file methods of a `pathlib.Path`
  (also one derived with `.parent`, `/`, `with_name`, `joinpath` or `resolve`), imports of
  `subprocess`, `socket`, `requests`, `httpx`, `urllib.request`, database and cloud clients and
  similar, and imports of an `adapters` package or module. `random-in-domain` also reports imports
  of the random-data and id generators `faker`, `mimesis`, `nanoid`, `shortuuid`, `cuid` and `cuid2`,
  `ulid.ULID()` with no argument and the `uuid6`/`uuid_utils` generators (`ULID.from_str(text)`
  and `uuid.UUID(text)` parse a value and are fine). `logger-in-domain` reports an import of
  `logging`, `structlog` or `loguru`, or of a project module whose last segment is `log`, `logger` or
  `logging` (also by a relative import such as `from . import logger`) or that sits in a `logger` or
  `logging` package; an import under `if TYPE_CHECKING:` is fine, as it is for the id, random and
  input-output imports above. Return a result that says what happened, or raise a domain error, and
  log it in `adapters/`; in `domain/` the `catch-log-without-exception` advice says the same instead
  of naming `logger.exception`. `module-state-in-domain` reports, once per state, a domain module that
  imports or reads another module's state: a module-level collection that some production function
  changes (what `module-level-mutable-state` reports at its definition) or a module-level instance of
  a project class that some production code changes, through an attribute assignment on it or a
  method of its class that assigns to `self` (`STORE = Store()` with `def add(self, item):
self.items.append(item)`), also through a package `__init__` that re-exports it and through
  `module.NAME` where `module` is an imported module; a parameter, local or attribute that only
  shares the name (`def apply(registry): registry.handlers`) is not followed. Constants that
  nothing changes (`LIMITS = {"default": 10}`), instances that nothing changes, and frozen values are
  fine: a frozen dataclass, `@attrs.frozen`, `@attr.frozen`, `@attr.s(frozen=True)`, a pydantic
  model with `model_config = ConfigDict(frozen=True)` (or `{"frozen": True}`) or a v1 `class Config:`
  with `frozen = True` or `allow_mutation = False`, a `NamedTuple` and an `Enum`. These are the TypeScript `domain-does-not-import-*` concerns: adapters,
  Node I/O and clients are `io-in-domain`, id libraries are `random-in-domain`.
- The domain rules also follow calls into project helpers outside `domain/` and `adapters/`: a
  domain call to a function, method or class (its `__init__`) of another production module that
  reads the clock, draws randomness or does input or output, itself or through further helpers, is
  reported at that call with the same rule id as the direct effect, and the message shows the path,
  for example `quote -> shop.shared.prices.fetch -> shop.shared.http.get_json -> requests.get`; a
  path longer than seven steps shows its first four and last two around `...`. The finding's
  subject and identity are the helper's qualified name (`shop.shared.prices.fetch`), not the path,
  so a change inside the helper keeps it and two helpers both named `fetch` stay apart. Calls are
  resolved through `import x as y`, `from x import f as g`, relative imports, names re-exported by
  a package `__init__`, `Class.method`, `self.method`/`cls.method` inside the same class, and bare
  decorators (`@register` is a call of `register`); recursion between helpers is followed once. A
  name means what the module binds at the top level: a function's own parameters and locals, and an
  import inside another function, do not change it, a later top-level assignment (`run = lambda:
1`) replaces an import, a definition inside a top-level `if` or `else` is preferred over an import
  in the other branch, and both sides of a `try`/`except ImportError` fallback count. An absolute
  import resolves to a project module only by its exact name, or by a shorter suffix whose first
  segment is a project directory that is neither a standard-library module nor installed outside
  the project, so `import json`, `import email` or `import redis` never resolve to a project's own
  `json.py`, `email.py` or `redis.py`. A helper that takes the clock,
  random source or client as a parameter (`def stamp(clock): return clock()`) stays legal, as do
  importing a helper without calling it, type-only imports and helpers nobody calls. Not followed,
  so not reported: methods of module-level or injected objects (`client.fetch()`), inherited
  methods, nested functions and lambdas, `getattr` and other dynamic calls, decorators that wrap
  a helper, and third-party code beyond the effect lists. Helper effects come from the same lists
  as the direct rules plus the HTTP (`requests.get`, `httpx.post`, `urlopen`), subprocess, socket,
  `shutil`, `tempfile`, `glob` and client-factory calls (`sqlite3.connect`, `create_engine`,
  `requests.Session`, `boto3.client`), and methods called on a client created in the same
  function. When a helper reaches an effect both through another domain module and directly, the
  path shown is the one that stays outside `domain/`. A helper that only logs is not reported; the TypeScript rule
  `domain-does-not-reach-io-through-shared` also counts reaching a logger package. Calls into
  another domain module or into `adapters/` are left to that module's own findings and to the
  import finding, so one cause gives one finding.
- `import-time-effect` reports an external effect that runs while a production module is imported:
  top-level statements (also inside top-level `if`, `try`, `for` and `with` blocks and the `else` of
  a main guard), class bodies, default argument values and decorators. Effects are the input and
  output calls above (`open`, `Path(...).read_text()`, HTTP requests, subprocesses, sockets,
  `sqlite3.connect`, `psycopg.connect`, `pymongo.MongoClient`, `os.makedirs`, `time.sleep`), starting
  a thread, process or scheduler (`threading.Thread(...).start()`, a name bound to one and then
  started, `ThreadPoolExecutor().submit`, an apscheduler scheduler's `start`, `multiprocessing.Pool`),
  `asyncio.run`, `uvicorn.run`, a `logging.FileHandler` without `delay=True`, `smtplib.SMTP(host)`,
  registrations that change the process (`atexit.register`, `signal.signal`,
  `threading.Timer(...).start()`, a `sched.scheduler`'s `run`, `logging.basicConfig(filename=...)`),
  package data and data files read like a path (`importlib.resources.files(...).read_text()`,
  `importlib.resources.read_text`, `pkgutil.get_data`, `pandas.read_*`, `numpy.load`,
  `nltk.download`), `Base.metadata.create_all`, and a method that does I/O on a client bound at
  module level (`ENGINE.connect()`, `S3.download_file(...)` on `boto3.client`, `CACHE.ping()` on
  `redis.Redis`; `pipeline()` and other local methods are fine), also when the name is bound in a
  class body or with an annotation, directly or through a project helper, function or class
  constructor (the message shows the path, as above), a helper reading a module-level `Path`
  constant included. The finding names the receiver as written (`ENGINE.connect`,
  `threading.Thread(...).start`). A bare decorator (`@register`) counts as a call of that
  function. Allowed: anything under a main guard (`if __name__ == "__main__":`, also written
  `"__main__" == __name__` or joined with `and` to another condition) or `if TYPE_CHECKING:`, function and class definitions, lazy
  factories (a function defined but not called at import), lambdas, pure constants,
  `logging.getLogger`, dataclasses and enums, `TypeVar`, `re.compile`, `Path(__file__).resolve()`
  and other path arithmetic, and creating a lazy client that connects only on first use
  (`requests.Session()`, `httpx.Client()`, `create_engine(url)`, `redis.Redis()`, `boto3.client`,
  `smtplib.SMTP()` without a host). Composition roots are exempt, as defined for
  `process-env-access` above (the Django settings module and `manage.py`, `wsgi.py` and `asgi.py`
  included), so is a file listed in `python.entryPoints`. Test files and test support, as defined
  for the security rules above, are out of scope. Reading the environment at import is
  `process-env-access` and is not reported again; in a `domain` module, input and output at import
  is reported once, as `io-in-domain`. Differences from the TypeScript `report-module-load-effects`:
  - Exempt files: TypeScript exempts the detected app entry and `layout.entryPoints`; Python also
    exempts every composition root by name, folder or factory (`main.py`, `cli.py`, `worker.py`,
    configuration modules, a module defining `create_app`, `pyproject.toml` script entry points).
  - Test scope: TypeScript skips test files and test directories; Python skips test files and the
    test support (`testing/`, `fixtures/`, `mocks/` and the other support folders that production
    code does not import).
  - Reported only in TypeScript: reading the clock or a random value at import (`Date.now()`,
    `Math.random()`, `crypto.randomUUID()`; in `domain/` Python reports these as `clock-now` or
    `random-in-domain`), any `process.*` call, a side-effect-only import, top-level `await`, a
    static block, and a top-level expression statement or control flow on its own. Python reports
    only the effects such statements run.
  - Reported only in Python: effects in expression statements, class bodies, default values and
    decorators (TypeScript reports effect calls only inside a module-level declaration), and effects
    reached through a project helper.
- `module-level-mutable-state` reports a module-level `dict`, `list`, `set` or `collections`
  container that a function changes (item assignment, `del`, `append`, `update`, ...), once, at its
  definition; a collection that is only read, a local of the same name and a module-level change
  are fine. `PLW0603` covers rebinding with `global`.
- `unsafe-path-join` follows the parameters of a function through `/`, `Path(...)`,
  `os.path.join`, `joinpath` and f-strings into file operations (`open`, `read_text`, `unlink`,
  `shutil.*`, `send_file`, ...). It stays quiet when the function checks containment
  (`is_relative_to`, `relative_to`, `startswith`, `commonpath`) in an `if`, or in a `try` whose
  handler exits; for values converted with `int`, `uuid.UUID`, `secure_filename` or `basename`,
  or reduced to `.name`; and for parameters annotated `Literal`.
- `handwritten-boundary-guard` reports `isinstance` on a value that came from `json`, `yaml` or
  `tomllib` parsing, `.json()` or an `Any` parameter, and `TypeGuard` or `TypeIs` functions over
  `Any` or `object`. `pydantic-any-field` and `pydantic-extra-allow` look at classes deriving from
  `BaseModel`, `BaseSettings` or `RootModel` anywhere (v1 `Config` and `Extra.allow` too).
- `eager-relationship` reports a SQLAlchemy `relationship` (or `backref`) mapped with
  `lazy="joined"`, `"subquery"`, `"selectin"`, `"immediate"` or the legacy `lazy=False`, also
  Flask-SQLAlchemy's `db.relationship` and SQLModel's `Relationship(sa_relationship_kwargs=...)`.
  Every query of the model then loads the related rows. Leave `lazy` at its default (or
  `"raise"`) and load per query with `options(selectinload(...))` or `joinedload(...)`. Port of
  the JVM `JpaLazyFetching`.
- `many-to-many-cascade-delete` reports a `cascade` with `all`, `delete` or `delete-orphan` on a
  `relationship` with `secondary=` (and on its `backref`), and SQLModel's `cascade_delete=True` or
  `sa_relationship_kwargs={"cascade": ...}` on a `Relationship` with `link_model=`: deleting one
  owner deletes rows that other owners still share. `secondary` also counts when it is passed
  positionally or through `sa_relationship_kwargs`; `single_parent=True` and `viewonly=True` are
  not reported. Port of
  the JVM `JpaManyToManyCascade`. Both rules check production sources only. Django has no eager
  mapping option (`select_related` and `prefetch_related` are per query) and its `on_delete`
  cascades are on foreign keys, not on a `ManyToManyField`, so neither rule applies to it.
- `repeated-string-literal` counts a string of five characters or more (with a letter or digit) used
  three times or more in a file (not tests, not generated migrations) and reports each use from the
  third on. Not counted: annotations, f-string parts, keyword arguments (Kotlin exempts named
  arguments the same way; TypeScript and Java have none), dictionary keys, the value under a
  `type`/`kind`/`tag`/`variant` key, subscript keys, `match` patterns, docstrings and bare strings,
  `Literal[...]` subscripts, `__all__` and class-body lists, the first argument of a translation or
  message-key call, and idiomatic text (encodings, HTTP methods, argparse actions, MIME types, time
  formats). The minimum length, the number of allowed uses and those lists are defined once in
  [`shared/literals/repeated-literal-exemptions.mjs`](../../shared/literals/repeated-literal-exemptions.mjs);
  `literal-exemptions.test.mjs` fails when `literals.py` drifts from it. The message ends with the
  `exceptions` route for the rule like every other Python rule.
- `generic-name` reports a file, a folder or a class (nested ones too) whose last name word is `util`,
  `utils`, `utility`, `utilities`, `helper`, `helpers`, `manager`, `managers`, `common`, `commons`,
  `misc` or `miscellaneous` (the list in `shared/naming/smell-words.mjs`, which the Kotlin preset uses
  too; trailing digits and version words such as `v2` are ignored). A last word that only wraps the
  real one (`functions`, `funcs`, `methods`, `module`, `modules`, `mixin`, `mixins`, `base`, `classes`,
  the container words of the same module) is skipped, so `util_functions`, `helper_module`,
  `OrderHelperMixin` and `HelperBase` are reported and `LoggingMixin` or `ModelBase` are not; a word
  elsewhere in the name (`common_prefix`, `get_common_ancestor`) is not reported. Test
  files are skipped. A class that extends a type with the same ending (`class SessionManager(CacheManager)`),
  a `managers.py` that holds a framework manager (`models.Manager`), `context_manager` and the roles
  `Authentication`, `Transaction`, `Cache`, `Entity`, `Session`, `Connection`, `Lock` and `Resource`
  before `Manager` or `Managers` (`ACCEPTED_MANAGER_ROLES` in the same module) are not reported.
- `boolean-flag-parameter` reports a positional `bool` parameter (annotated `bool` or
  `Annotated[bool, ...]`, as a string too, or defaulted to `True` or `False`; `int | bool` is not one,
  and a nullable `bool | None` is a tri-state, not a flag) of a public function or method that is a condition: the test of an
  `if`, a conditional expression, a `while`, an `assert`, a comprehension filter, a `match`
  subject or guard, also under `not`, `and` and `or`, as `flag is True` or `flag == False`, and
  inside a nested lambda or closure. The flag is keyword-only (`def send(message, *, urgent=False)`),
  two functions, or an enum. A name the code rebinds (a loop variable, a lambda parameter, an
  assignment) is not the flag. Private names (a leading underscore, which covers `__init__` and
  the other dunder methods), methods of a private class, nested functions, tests, methods named
  `set_*` or `with_*`, `@classmethod` and `@staticmethod` factories named `from_*`, `of` or
  `builder`, functions with `@override`, `@abstractmethod`, `@overload`, a property `setter`,
  `getter` or `deleter`, or a pydantic `field_validator`, `validator` or `model_validator`, and a
  flag that is only passed on or stored are not reported. A module function named `set_up_db` or
  `from_config` is checked. A method that overrides a base class without `@override` is reported;
  mark it `@override` (`typing_extensions.override` before Python 3.12). The finding names the
  class: `Mailer.deliver(urgent)`. The [parameter rules table](../internals.md#parameter-rules-across-presets)
  compares the presets.
- Unused arguments (ruff `ARG001`-`ARG005`) skip names that start with `_`, `*args` and `**kwargs`,
  `@override` and `@abstractmethod` methods, `@overload`, dunder methods other than `__init__`,
  `__new__` and `__call__`, and bodies that are only `...`, `pass`, a docstring or
  `raise NotImplementedError`. A callback signature that fixes a parameter the body does not read
  takes the `_` prefix (`def handler(event, _context)`); a parameter the framework passes by
  keyword (a FastAPI path parameter, a pytest fixture requested for its effect) keeps its name and
  the path gets an exception. Test files are skipped, as for the other `ARG` use.
- `hardcoded-secret` reports a secret string assigned to a name ending in `password`, `passwd`, `pwd`,
  `passphrase`, `secret`, `token`, `credentials`, `api_key`, `private_key`, `access_key`, `secret_key`,
  `auth_key`, `signing_key`, `encryption_key`, `hmac_key` or `jwt_key` (a trailing `value`, `raw`,
  `str`, `string`, `text` or `plain` is ignored; tokenizer marker tokens such as `eos_token` and
  `pad_token` are not secrets). The value rules are shared with the other presets
  (`shared/naming/secret-words.mjs`, mirrored in `rules/credentials/spec.py`): six characters or more
  with letters and digits, or three character classes; for a `password`, `passwd` or `passphrase`
  name also eight characters or more with a lowercase letter followed by an uppercase one
  (`CorrectHorseBatteryStaple`, not a single word such as `Elephantine` or an all-lowercase
  `hunterhunter`). Not secrets: placeholders (`changeme`, `<...>`, `${...}`, `$NAME`, `{{...}}`,
  `{name}`, `%s`, `%(name)s`, `:name`, `****1234`), environment variable names, header names, lowercase
  paths and message keys (`prod/db-creds-v2`, `errors.token.expired_v2`, `/etc/app/creds.json`),
  regular expressions (`^...$`), URLs, a value equal to the name and an identifier that contains a
  secret word (`extra_token_1`, `newPassword`); a credential-shaped value is left to
  `credential-shape`. Where: a variable (also through `:=` and tuple unpacking), attribute,
  parameter default, keyword argument, dictionary entry, `setattr(obj, "password", ...)`, a subscript
  (`os.environ["DB_PASSWORD"] = ...`, `config["api_key"] = ...`), a `field(default=...)`, a
  `SecretStr(...)` or `SecretBytes(...)`, the `return` of a secret-named function or property without
  parameters, a literal built from parts, `bytes`, `.encode()` or `str()`, the literal that opens the
  value (`"...".strip()`, `"..." + suffix`, not `"...".format(...)`, `.join`, `.split` and other calls
  that make another value), or a fallback: `x or "..."`, either branch of a conditional, and the
  default of a settings read with a secret key or assigned to a secret name: `os.getenv`,
  `os.environ.get`/`setdefault`/`pop`, `get`/`getenv`/`setdefault`/`pop`/`str` on a receiver named
  `env`, `environ`, `environment`, `secrets` or `settings`, `config(k, default=...)` (python-decouple),
  `env(k, ...)` (environs) and `add_argument("--password", default=...)`. Members of an `Enum` class
  are skipped. `credential-shape` reports, anywhere, strings shaped like an AWS key, a GitHub or Slack
  token, a `sk_live_`/`sk-proj-` key, a private key header, a `django-insecure-` key, a URL with
  `user:password@`, a `password=` parameter or a `Bearer`/`Basic`/`Token` value. `secret-in-log`
  reports such a name (not `has_*`/`is_*`; a constant name only when it is a key that is read, as in
  `os.environ["API_TOKEN"]` or `os.getenv("API_TOKEN")`) passed to a logger call, `print`,
  `pprint.pprint`, `sys.stdout.write`, `sys.stderr.write`, `click.echo`, `click.secho`,
  `warnings.warn` or the exception of a `raise`: as an argument, attribute (not a member of a
  `tokenizer`), subscript, `.get("token")`, keyword argument or `extra` entry whose value is not a
  status, in an f-string, `%` or `.format` text, through `:=`, or wrapped in `str()`;
  `token is not None` and `len(token)` are fine. Test files are skipped, as in the other presets. A
  module name used as a key of a documentation table (`'pwd': 'pwd#module-pwd'`) is a false
  positive; add an exception for the file.
- `io-in-loop` reports an HTTP, database or repository call once per item of a `for`, `while` or
  comprehension; `asyncio.gather` over a comprehension, a call that `unbounded-fan-out` reports
  at the same site (so one remote call has one owner), a worker task started once per slot of a
  count (`for _ in range(workers)`), a paging loop (the condition reads a variable the body
  assigns) and a retry (a `try` in the loop that returns on success) are not. A remote call in a
  task that is bounded or awaited one at a time keeps this finding, with the batching remedy.
- `unbounded-fan-out` reports `asyncio.gather`, `asyncio.wait` and `asyncio.as_completed` over a
  generator, a list comprehension, `map(f, xs)`, a name bound to one, or a list filled by
  `append` in a `for` loop, and `asyncio.create_task`, `ensure_future`, `tg.create_task` and
  `nursery.start_soon` inside a loop or comprehension, when the coroutine makes a remote call
  (`requests`, `httpx`, `aiohttp`, `urllib3`, `urllib.request.urlopen`, `boto3` clients, OpenAI and
  Anthropic clients) or publishes to a broker (`aiokafka`, `kafka`, `confluent_kafka`, `pika`,
  `aio_pika`, `redis` `publish`, `nats`, Pub/Sub, `paho.mqtt`, SQS, SNS, EventBridge and Kinesis
  through `boto3`) and runs over a collection that is not fixed. The client factories are the ones
  `io-in-loop` uses, from one table. The coroutine is resolved when it is a client call, a nested
  or module-level `async def` of the project, a method of the same class or an imported project
  function, up to three calls deep. A client is recognized from its factory (`httpx.AsyncClient()`
  in an assignment or `async with`, also `self.x`), or from a parameter, `self` attribute or
  variable annotated with the library type. Database calls are the business of `io-in-loop`.
  Allowed: an `asyncio.Semaphore`, `BoundedSemaphore`, `Lock`, anyio or trio `CapacityLimiter` or
  `Semaphore`, `aiolimiter.AsyncLimiter` created outside the task and entered in the task body
  (`async with limit:`); a parameter annotated with one of those types, or one the caller passes a
  limiter it created; a parameter or imported name whose name ends in `sem`, `semaphore`, `limit`,
  `limiter`, `throttle`, `throttler`, `capacity` or `gate`; an `await gate.acquire()` on such a
  limiter or a `gather` that drains a window inside the loop; a literal or constant collection,
  the members of an `Enum` class of the project, a slice or `islice` with an explicit size, and
  chunks from `batched`, `chunked`, `chunks` or `partition_all` with a size. A worker pool is
  bounded by its count: `range(workers)` and `range(3)` pass, while `range(len(xs))` stays a
  fan-out over `xs`. A semaphore created inside the task, or a limit constant that nothing
  acquires, bounds nothing. `asyncio.to_thread` and `loop.run_in_executor(None, ...)` run on the
  default thread pool, which has a fixed size, so they are not reported. Test files are exempt.
  Limits: an unannotated `client` parameter, a callable wrapped in `functools.partial` and a
  library outside the list are not recognized, a limiter is recognized from an unannotated
  parameter or import by its name only, and a collection that is small in practice but not by
  construction is reported; lift such a path with a `python.exceptions` entry.
- `task-outlives-resource` reports a resource that a `with` or `async with` opened inside a task
  group closes while a child task can still use it. Task groups are `trio.open_nursery()`,
  `anyio.create_task_group()` and `asyncio.TaskGroup()` (also through import aliases and a group
  held in a local variable, `tg = anyio.create_task_group()` then `async with tg:`). The resource is
  the name an inner `with ... as name` binds, and it is handed over when it is a positional
  argument of `start_soon` or `start` (`nursery.start_soon(consume, handle)`), a bound method
  (`start_soon(handle.serve)`), a `lambda`, `functools.partial` or local `def` that captures it
  (a parameter or a local rebinding of the same name is not a capture), or an argument or receiver
  of the coroutine passed to `create_task` (`group.create_task(use(handle))`). A task assigned to a
  name that is read again inside the `with` block (`await task`, `asyncio.wait([task])`) is
  accepted, since the parent waits for it. Inside a plain `with res:` or `with open(...) as res:`
  block, `asyncio.create_task(use(res))` or `asyncio.ensure_future(...)` as a statement is
  reported when the task is discarded or its variable is never read before the block ends. The
  allowed forms are a `with` that encloses the whole group, a resource opened inside the child, and
  awaiting the task before the block exits. Ownership is modeled explicitly rather than inferred:
  only the resource itself counts, so a value derived from it (`handle.name`, `handle.read()`,
  `stack.pop_all()` for an `ExitStack` that moves ownership) is not reported, and neither is a
  helper that is given the resource under another name; cancel scopes, timeouts and task groups
  opened inside a group are not resources; keyword arguments such as `name=` are not passed to the
  child; a task that is returned, collected or handed to another function is not tracked. A helper
  that takes ownership and closes the resource itself is not recognized, and neither is a parent
  that waits on an event instead of the task: open the resource in the child, or add a reviewed
  `python.exceptions` entry. A group held in an attribute (`self.group`) is not followed. The
  group-scoped form follows the documented flake8-async ASYNC111 behavior, extended to
  `asyncio.TaskGroup` with explicit lifetime modeling; Ruff 0.16.8 and 0.16.9 have no ASYNC111, and
  no flake8-async code is used. The identity is the resource name, the method and the enclosing
  function. Ruff's `RUF006` reports the discarded `asyncio.create_task(...)` statement for its own
  reason (the task can be garbage collected) and keeps its own finding.
- `unclosed-inline-resource` covers what ruff's `SIM115` leaves out: a file, URL, archive, socket
  or database handle opened and used in the same expression, with no `with` (the receiver of a
  call, an argument or a `for` source). Checked in ruff 0.16.9, `SIM115` reports `open`, `io.open`,
  `codecs.open`, `gzip.open`, `bz2.open`, `lzma.open`, `tarfile.open`, `shelve.open`, `dbm.open`,
  `tempfile.TemporaryFile`, `tempfile.NamedTemporaryFile` and `Path(...).open()` outside `with`,
  also inline (`json.load(open(path))`), but not in a `return` statement
  (`return open(path).read()`), and never `urlopen()` or `.open()` on a path held in a name. So the
  script reports those openers only in a `return`, and these everywhere: `zipfile.ZipFile`,
  `tarfile.TarFile`, `os.fdopen`, `socket.create_connection`, `sqlite3.connect`,
  `urllib.request.urlopen` (not over `io.BytesIO`, `io.StringIO` or `":memory:"`), and `.open()` on
  `Path.home()`, `Path.cwd()`, a `path / "name"` or a name annotated or assigned as a `Path` in the
  same function. An argument counts only when the call reads the handle and keeps nothing (`load`,
  `safe_load`, `full_load`, `copyfileobj`, `read_file`, `file_digest`, `parse`, `iterparse`), since
  a response, a wrapper class or a collection that takes the handle owns it
  (`StreamingResponse(open(path, "rb"))`). Wrapping in `io.TextIOWrapper` or `gzip.GzipFile` moves
  the check to the wrapper; `contextlib.closing`, `ExitStack.enter_context`, `.close()`, a `return`
  of the handle itself and an assignment pass. `os.scandir` is left out: its iterator closes itself
  when a loop runs it to the end. CPython closes the handle when the last reference goes, so
  the leak is the PyPy one and the exception one (a traceback keeps the frame and the handle), plus
  a `ResourceWarning` when warnings are on (`-X dev`, pytest). `with sqlite3.connect(path)` only
  commits, so its message names `contextlib.closing(sqlite3.connect(path))`. Not in tests.
- `unshielded-cleanup-await` follows the documented flake8-async ASYNC102 behavior for Trio and
  AnyIO, which cancel again at every checkpoint of a cancelled scope: an `await`, `async with`,
  `async for` or async comprehension inside `finally:` or inside a handler for `trio.Cancelled` or
  `anyio.get_cancelled_exc_class()` (import aliases, tuples and names bound once by assignment
  included, such as `cancelled = anyio.get_cancelled_exc_class()`) can be cancelled before the
  cleanup finishes, so the resource may never be released. The check runs only in a module that
  shows Trio or AnyIO cancellation semantics: any import of `trio`, or for AnyIO a use of
  `anyio.create_task_group`, `anyio.CancelScope`, `anyio.move_on_after`, `anyio.fail_after`,
  `anyio.run` or `anyio.get_cancelled_exc_class`, so a module that imports `anyio` only for
  `to_thread` or `Path` is not checked. It reports the first checkpoint per block and allows it
  inside a `with` that sets `shield=True` (a literal, or a name bound once to `True`) in a
  `trio.CancelScope`, `trio.move_on_after`, `move_on_at`, `fail_after`, `fail_at`,
  `anyio.CancelScope`, `anyio.move_on_after` or `anyio.fail_after`, called in the `with` or held in
  a variable (`scope = trio.CancelScope(shield=True)`, then `with scope:`), in the block or around
  the `try`. The message recommends `CancelScope(deadline=..., shield=True)`, because a shield
  without a deadline can hang shutdown on a stuck close; such an unbounded shield is allowed, and
  the deadline is not checked. `move_on_after(5, shield=True)` and `fail_after` need Trio 0.27 or
  later for the `shield` argument. `trio.aclose_forcefully(...)` and the
  `cancel_shielded_checkpoint()` helpers cannot be interrupted and are allowed. A shield set after
  the scope is created (`scope.shield = True`) is not followed, and `except BaseException` and bare
  `except:` handlers are not treated as cancellation handlers, because the evidence that they catch
  a cancellation is missing. asyncio cancels a task once (`CancelledError` is raised at the `await`
  that is waiting, and later awaits run normally unless the task is cancelled again), so the Trio
  assumption does not carry over: modules without that evidence are not checked. `asyncio.shield`
  is not a scope: it protects the inner task but the shielding `await` is still interrupted, and
  its inner task must stay referenced; neither is modeled. Ruff 0.16.8 (the version pinned in
  `.github/python-e2e-constraints.txt`) and 0.16.9 have no ASYNC102, and no flake8-async code is
  used. The identity is the checkpoint, the block and the enclosing function.
- `todo-without-issue` reports `TODO`, `FIXME`, `XXX` and `HACK` (in comments and docstrings) when the
  marker is in capitals, at the start of the comment or followed by `:` or `(`, and is not directly
  followed by an issue reference: `#123`, a key such as `PROJ-123` (not `SHA-1`, `UTF-8`, `RFC-7231` and
  similar standards) or an `http(s)` link. Each marker is judged on its own, so a second marker in the
  same comment needs its own issue. Prose that mentions the word (`todo lists`, `Todo list items`,
  `Hack to ...`, `the list of TODO items`) is not a marker. The Kotlin preset's `ForbiddenComment`
  follows the same rule (plus `STOPSHIP`); `shared/naming/test-support/task-marker-cases.json` is the table both are
  tested against. `TD` and `FIX` from ruff are not used, because they ask for an author and a date.
- `tri-state-boolean` owns every nullable boolean: `bool | None`, `None | bool`, `Optional[bool]` and
  `Union[bool, None]` (also as a string, inside `Annotated`, `Final` or `ClassVar`) on a parameter, a
  return value, a class or module field and a `self.x: bool | None` attribute. `boolean-flag-parameter`
  reports only a plain `bool` parameter, so a parameter is never reported by both. A union with
  another type (`bool | str | None`) is not a tri-state boolean. Local variables, type aliases,
  overloads, `@override` methods, a method that overrides a base class of the module or whose base
  comes from another module (the base fixes the signature; name `@override` on it), the protocol hooks
  `__exit__`, `__aexit__` and `eof_received`, `pytest_*` hooks and test files are skipped. Fields of
  data that is mapped from outside are skipped too: a class that derives from a pydantic
  `BaseModel` or `BaseSettings`, `SQLModel`, a Django `Model`, a SQLAlchemy `DeclarativeBase` or
  `Base`, `Document`, `Schema` or `TypedDict` (also through a base class of the module). The allowed
  form is an enum that names the third state (`Consent.UNKNOWN`), or a keyword-only `bool` with a
  default (`*, urgent: bool = False`) when `None` only meant false.
- `orm-schema-sync` (the Python counterpart of the Spring rule `spring/ddl-auto`) reports schema
  changes the ORM makes while the application runs: SQLAlchemy and SQLModel `metadata.create_all`
  and `drop_all` called or passed (`conn.run_sync(Base.metadata.create_all)`) inside a function
  (at module level, `import-time-effect` reports it), `db.create_all()` and `db.drop_all()` in a
  project that imports `flask_sqlalchemy`, Tortoise `register_tortoise(..., generate_schemas=True)`
  and `Tortoise.generate_schemas()`, Peewee `create_tables`/`create_table` in a project that imports
  `peewee` or `playhouse`, and Pony `generate_mapping(create_tables=True)`. An `if` around the call
  does not lift it: the schema still changes in every other environment. Skipped: tests,
  `conftest.py` and test support files, Alembic migrations (a module that imports `alembic`, or
  under a `migrations`, `versions` or `alembic` folder), and one-off entry points: a block under
  `if __name__ == "__main__":` and a function decorated as a CLI command (`@click.command()`,
  `@app.cli.command()`, Typer's `@app.command()`). The allowed form is a migration (Alembic, Django
  migrations, Aerich).
- `orm-query-logging` (the counterpart of `spring/unsafe-diagnostics`) reports SQLAlchemy and
  SQLModel `create_engine`, `create_async_engine` and `engine_from_config` with `echo=True`,
  `echo="debug"` or an `echo` set by a condition, `engine_options={"echo": True}`,
  Flask-SQLAlchemy `SQLALCHEMY_ECHO` on (assignment, `app.config[...]`, `config.update(...)` or a
  dict key), `logging.getLogger("sqlalchemy")` or `"sqlalchemy.engine"` set to `INFO` or `DEBUG`,
  the `peewee`, `tortoise.db_client` and `django.db.backends` loggers set to `DEBUG`, and the same
  levels in a `LOGGING` dict (also as `"DEBUG" if DEBUG else "INFO"`). A value the check cannot
  resolve, such as `echo=settings.DEBUG`, is not reported. The allowed form logs slow queries only
  (SQLAlchemy cursor events, or the database's slow-query log).
- `falsy-default` reports a parameter whose annotation can be falsy (`int`, `float`, `str`, `bytes`,
  `bool`, a list, dict, set or tuple type, a `Sequence`, `Mapping`, `Decimal`, `timedelta`) and is
  `None` by default or by its type, when the body writes `param or default` or
  `param if param else default` in a value position: an assignment, a return, an argument. A default
  that is itself empty (`or []`, `or {}`, `or ""`, `or 0`, `or ()`, `or set()`) is not reported,
  since the falsy value is already what it becomes. A parameter the function compares with `None`
  anywhere, a condition (`if a or b`, `while`, `assert`, `bool(...)`, `not`, an `and` chain, a
  comprehension filter), an unannotated parameter and a parameter of a class that is never falsy
  (`Path`, a project class) are not reported. The allowed form tests `None` only:
  `limit if limit is not None else DEFAULT_LIMIT`.
- `number-truthiness` reports a number (`int`, `float`, `complex`, `Decimal`, `Fraction`, also
  `Optional` and `|` members) that is tested for truth, where `0` reads as false or missing: a
  parameter or annotated local, and a number field of a class in the same module read through a
  parameter of that class or through `self` (`message.retry`, `self.size`). Reported forms:
  `if count:`, `if not record_id:`, `x if retry else y`, `while left:`, `assert total`, a
  comprehension filter, an operand of `and`/`or` in a condition, any operand of `and` but the
  last, and an operand of `or` but the last, such as `limit or 10` on a required parameter (an
  optional one is `falsy-default`'s). Test files are checked too. Not reported: `bool(count)`, the
  last operand of an `and`/`or` outside a condition, an `or` that ends in `0` (`count or 0`), a name
  the function binds again (`count = len(rows)`, a loop target, an import, a nested `def`, an
  `except ... as` or a `match` capture; `count -= 1` and `count = count - 1` keep it a number), a
  name of a nested function, a field of a class from another module, and a value whose type is
  not annotated. The allowed form compares: `count > 0`, `count != 0`, `index != -1`, and
  `count is not None` for an optional number. This is the counterpart of the TypeScript preset's
  `nitpicker/strict-boolean-expressions`.
- `parameter-mutation` reports a parameter annotated as a `list`, `dict`, `set`, `deque`,
  `bytearray`, `defaultdict`, `OrderedDict`, `Counter`, `MutableSequence`, `MutableMapping` or
  `MutableSet`, or a project `TypedDict` (a class that derives from `TypedDict`, resolved
  through imports, subclasses, generic forms (`Box[int]`) and `Union` members, and treated as a
  `dict`; the functional `TypedDict("Name", {...})` form is not resolved), also `Optional` and
  `|` members, `typing` aliases and strings, that
  the function changes in place: `.append`, `.extend`, `.insert`, `.remove`, `.pop`, `.clear`, `.sort`, `.reverse`,
  `.update`, `.setdefault`, `.popitem`, `.add`, `.discard` and the other mutating methods of its type,
  an item or slice assignment (`p[k] = v`, `p[:] = x`, `p[k][j] = v`), `del p[k]`, an in-place operator
  that the type implements as mutation (`p += [x]` on a list, `p |= other` on a set or dict) and
  `random.shuffle`, `heapq.heappush`, `heapq.heappop`, `heapq.heapify`, `heapq.heapreplace`,
  `heapq.heappushpop` and `bisect.insort*` on it, a call on a nested item (`table[k].append(x)`),
  every target of `del a[0], b[k]` and of a tuple assignment, and the same operations on a one-hop
  alias (`alias = items`, `self.items = items`). A rebind makes the parameter a copy only when the
  right side is one (`list(p)`, `[*p]`, `{**p}`, `p.copy()`, `sorted(p)`, `p[:]`, `p + [x]`,
  `copy.copy`, `copy.deepcopy`, a comprehension, a class call that unpacks the parameter
  itself, such as `Movie(**p)`) and it comes before the first change; `p = p or []`
  and `if p is None: p = []` keep the caller's list on the other branch and are reported. A
  comprehension variable or lambda parameter named like the parameter is its own scope. Not
  reported: `self` and `cls`, unannotated and read-only (`Sequence`, `Mapping`) parameters,
  queues (`queue.Queue`, `asyncio.Queue`, which are not list-like types here), `pytest_*` hooks,
  `@override` and `@overload`, private helpers (`_name`) and functions nested in another function
  (the hazard is a public function that changes the caller's data), and test files. Attribute
  writes are not reported: a project `@dataclass` must be `frozen=True` (`frozen-dataclass`), so
  `p.field = v` raises at runtime and the type checker rejects it, and other class instances (a pydantic model, an
  ORM entity) are skipped like class instances in the TypeScript preset. A constructor
  that changes its argument is reported like any other function. The allowed form returns a new
  value (`[*items, item]`, `{**table, key: value}`) or copies the argument first.
- `regex-unescaped-value` reports a function argument built into the pattern of a `re` or `regex`
  call (`compile`, `match`, `search`, `fullmatch`, `sub`, `subn`, `split`, `findall`, `finditer`,
  also imported by name or passed as `pattern=`) through an f-string, `+`, `%` or `str.format`,
  without `re.escape`: a `.`, `|` or `$` in the value changes the pattern. The value counts when it
  reads a parameter of the enclosing function or lambda (not `self` or `cls`), directly or through a local assigned from
  one, a `for` target or a comprehension over one. An `int`, `float`, `bool` or `complex` parameter,
  `re.escape` (also passed to `map` or used in a comprehension) or a helper whose name contains
  `escape` and `regex` or `pattern`, a `len()` or `int()` call, the condition of a conditional
  expression, a compiled pattern's `.pattern`, module constants and module-level code are not
  reported, and neither is a value passed as the whole
  pattern (`re.compile(pattern)`): the issue suggested reporting a non-constant whole pattern as a
  note, but a lone value is meant as a pattern far more often than not. The Java and Kotlin presets report the same mistake as
  `UnquotedRegexValue`, the TypeScript preset as `nitpicker/no-string-as-regex`. The plain-text form
  (`re.sub("abc", "", s)` for `s.replace("abc", "")`) is ruff's `RUF055`, still a preview rule in
  the pinned ruff, so it is not selected yet.
- `compatibility-shim` reports four ways to keep an old name alive: a module-level `def
__getattr__` that warns or maps removed names to new ones (a PEP 562 lazy import through
  `importlib.import_module` is not a shim), a `warnings.warn` (or `warn_explicit`) call whose category
  or first argument is `DeprecationWarning`, `PendingDeprecationWarning`, `FutureWarning` or a class
  named `...DeprecationWarning`, a `@deprecated` decorator
  (`typing_extensions`, `warnings`, `deprecated`, `deprecation`, or a project one) on a function
  or class, and a top-level `OldName = NewName` statement where `NewName` is a function or class
  defined in the module or a name imported with `from ... import`, when the alias casing matches the
  target (a lowercase `backend_class = Backend` is a configuration value). Underscore-prefixed names
  (`_Alias`, `Public = _Private`, `__version__`), a name published in `pyproject.toml`
  `[project.scripts]`, `[project.gui-scripts]` or `[project.entry-points]`, aliases inside `if`, `try`, functions and classes (the
  `try: import fast / except ImportError: fast = slow` fallback and `__radd__ = add`) and test
  files are skipped. A finding on a line the change touches is new (see Touched code), so only a
  shim the change adds or edits fails. mypy's `deprecated` and pyright's `reportDeprecated` (the Deprecated APIs row)
  report a call to a deprecated name; this rule reports the definition that keeps one alive. A
  published library that has to keep a deprecation takes an exception for its public modules.
- `ERA001` finds commented-out code by a heuristic: a comment that parses as a statement. Prose
  that happens to parse is reported too (a label such as `Contact: someone`, a formula, a bare
  `name: value` note); reword it, or add an exception for the file.
- The `S` group is selected by code, without the rules left off below; `S324`, `S501`,
  `S113`, `S301`, `S302`, `S506`, `S307`, `S102`, `S202`, `S201`, `S306`, `S108`, the XML rules
  `S313`-`S319`, the TLS rules `S323`, `S502`-`S505`, `S507`-`S509`, `S701`, `S702`, `S704`, `S308`
  and the legacy protocol rules `S312`, `S321` each carry the safe form. The XML fix, `defusedxml`,
  is a dependency, and strict mypy wants `types-defusedxml` next to it.
- `S` rules left off (they flag idiomatic code): `S101` (`assert`, used by the tests that nitpicker
  requires), `S608` (replaced by `sql-string-formatting`), `S103` and `S104` (file modes and binding `0.0.0.0` in a server), `S105`-`S107` (the
  `hardcoded-secret` rule above does the same with fewer false positives), `S310` (`urlopen` of a
  fixed URL), `S311` (`random` for non-crypto use, which the domain rule covers), `S601`, `S603`,
  `S606` and `S607` (see above), and `S110`/`S112` (replaced by `swallowed-exception`).
- Other rules of the selected groups that are left off: `TRY003` (long messages in `raise`),
  `TRY300` and `TRY301` (`else` after `try`, `raise` inside `try`), and, for `PT`, `PT009` and `PT027` (`unittest` assertions, which `unittest`
  projects use by design). `PT011` and `PT030` ask for a `match` or a more specific class.
- The pitfall groups `ASYNC`, `DTZ`, `LOG`, `PLE`, `PLW` and `T10` list every stable code of
  ruff 0.16.8 (the version CI pins) except these, each with its reason at the end of
  `nitpicker-ruff.toml`: `PLW1641` (equality without a hash: a mutable class may be unhashable on
  purpose), `PLE0116` (`continue` in `finally`, which ruff reports only below Python 3.8, and the
  lint always passes `--target-version py38` or later), and the codes another selected rule
  already reports at the same site: `PLE1132` (`PIE804`), `PLE1300` and `PLE1307` (`UP031`,
  `UP032` and `F509`), `PLE1310` (`B005`) and `PLW0711` (`B030`). Every selected pitfall code has
  its own allowed form (`rules/hints/pitfalls/`). All of them apply to test files too, except
  `DTZ`, whose findings are dropped there like `ARG`.
- `ASYNC`: inside `async def`, sleep with `await asyncio.sleep(...)`; call HTTP through an async
  client (`httpx.AsyncClient`) and processes through `asyncio.create_subprocess_exec`; read files
  and check paths with `anyio.Path` or `await asyncio.to_thread(...)`, and read `input` with
  `await asyncio.to_thread(input, prompt)`. A timeout scope holds an `await` (`ASYNC100`). An
  `async def` takes no `timeout` parameter (`ASYNC109`, from Python 3.11 for asyncio): the caller
  bounds it with `async with asyncio.timeout(...)`, the one way that composes through every call
  below it; a method that overrides a base signature takes `@typing.override`, and a wrapper of
  `asyncio.timeout` names its parameter otherwise (`delay`). Wait on an `asyncio.Event` instead of
  a sleep loop (`ASYNC110`). For trio and anyio: await `trio.sleep`, `trio.lowlevel.checkpoint()`
  for a bare yield and `trio.sleep_forever()` for an indefinite wait. These are local checks:
  `ASYNC100` does not follow a checkpoint through helpers.
- `DTZ`: pass the zone everywhere a datetime is made: `datetime(2026, 1, 1, tzinfo=timezone.utc)`,
  `datetime.now(tz=timezone.utc)` (for `now()`, `today()` and `utcnow()`),
  `datetime.fromtimestamp(value, tz=timezone.utc)` (for `utcfromtimestamp` too) and
  `datetime.max.replace(tzinfo=timezone.utc)` (`datetime.min` likewise). Parsing (`DTZ007`) uses
  `%z`, attaches the known zone with `.replace(tzinfo=...)`, or reads a date-only or time-only
  string with `date.fromisoformat` or `time.fromisoformat`. A date comes from
  `datetime.now(tz=zone).date()` (`DTZ011`) or `datetime.fromtimestamp(value, tz=zone).date()`
  (`DTZ012`) with the zone the date is meant in, since `date.today()` is the server's local date.
  A naive civil time that is meant takes a path exception. Domain code reads no clock at all
  (`clock-now`), so the `datetime.now(...)` forms belong in adapters and the composition root.
- One finding per site. Where a nitpicker rule already reports the same problem, the ruff finding
  is dropped: `DTZ002`, `DTZ003`, `DTZ005` and `DTZ011` on a `clock-now` (domain code) or
  `real-clock-in-test` line, so the one finding left names one fix (inject the clock, or freeze
  it); `ASYNC110` on the `while` loop around a `sleep-in-test` call; `PLE1507`, `PLW1507` and
  `PLW1508` on a `process-env-access` line (read the environment in the composition root, where
  these report with their own forms); and `PLW0129` on a `tautological-assert` line. Among ruff's
  own rules, `LOG015` owns the `G010` of `logging.warn`, `ASYNC230` and `ASYNC240` own the `PTH`
  finding of the same call, and `PLE0115` owns the `PLW0602`/`PLW0603` of its `global`.
  `ASYNC251` is not reported in test files, where `sleep-in-test` owns sleeping. The rules script
  lists its sites (`rules-allowances.json`) and `rules/filters/ruff-allowed-forms.mjs` drops
  them, but only while the owning finding survives `python.exceptions`: an exception for
  `clock-now` on a path brings `DTZ005` back there.
- `LOG`: create loggers with `logging.getLogger(__name__)` (not `logging.Logger(...)`, `__file__`
  or `__cached__`) and log through them, not the root logger (`LOG015`). `logger.exception(...)`
  and `exc_info` belong inside an `except` handler, without `exc_info=False` (use
  `logger.error(...)` then); use `logging.WARNING`, not `logging.WARN`.
- `PLE` and `PLW` check invalid operations and suspicious code: special-method signatures and
  return types, `__all__` of strings, `global` and `nonlocal` declarations (remove them and pass
  the value in), logging argument counts, `os.getenv` types, a loop variable overwritten in its
  body (bind a new name), an exception built and not raised, a lock made inside `with`, nested
  `max`/`min` and `subprocess.run` without `check` (`check=True`, or `check=False` with the
  return code handled). `PLW0108` asks to pass the function itself (`key=str`); a lambda that must
  look a name up at call time takes an exception. `T100` rejects committed debugger imports and
  breakpoints.
- The advice follows the project when two forms are valid. Pytest style: the parentheses of
  `@pytest.fixture` (`PT001`) and marks (`PT023`) and the shape of `parametrize` (`PT006`,
  `PT007`) are read from the project's `[tool.ruff.lint.flake8-pytest-style]` table (`pyproject.toml`,
  `ruff.toml`; from the head checkout for both sides of a comparison, so editing the table does not
  turn unchanged tests into new findings), and where it sets nothing from the majority of the
  project's own test code
  (`rules/libraries/pytest-style.mjs`); a tie leaves ruff's default. Ruff gets the result as
  `--config` flags, so the gate and the advice agree. Logging and validation: `project-libraries.mjs`
  reads the dependencies (`pyproject.toml`, `Pipfile`, `requirements*.txt`) and words the logging
  advice for structlog (`logger = structlog.get_logger()`, `logger.info("loaded", count=count)`) or
  loguru (`logger.info("Loaded {}", count)`), and the boundary advice for pydantic (`model_validate`),
  msgspec, cattrs or marshmallow. The rules stay the same for every project: `%s` arguments
  rather than an f-string, and a validator in `adapters/`; only the example differs. The same
  module is the place to swap in the conventions work's library detection.
- Pytest-specific rules read the project: `uncollected-tests` applies when the test runner is
  pytest and reads the whole collection configuration from `pytest.ini`, `pyproject.toml`
  (`[tool.pytest.ini_options]`), `tox.ini` or `setup.cfg`: `python_files`, `python_classes`,
  `python_functions`, `testpaths`, `norecursedirs`, and `--ignore`, `--ignore-glob`, `--deselect`,
  `-k` and `-m` in `addopts`; a `collect_ignore` in `conftest.py` counts as well. It reports a test
  that pytest will not run and says why: a file that matches no `python_files` pattern, a file or
  folder excluded by `norecursedirs`, `--ignore` or `collect_ignore`, a class that matches no
  `python_classes` pattern or has an `__init__`, a function that matches no `python_functions`
  pattern, a test deselected by `--deselect`, `-k` or `-m` (a `-m` expression matches marker
  names exactly, from the function, its class and the module's `pytestmark`). For `unittest` it reports a file named like
  a test file (`tests.py`, `*_test.py`) that its default `test*.py` discovery does not find. `test-helper-in-source` reports `testing.py`, `testutils.py`,
  `fixtures.py` and the folders `testing/`, `testutils/`, `test_utils/`, `test_helpers/`,
  `test_support/`, `test_fixtures/` and `fixtures/` inside a source root.
- `skipped-test-without-reason` reports a test that silently does not run: `@pytest.mark.skip`,
  `skipif` and `xfail` without a reason (a `reason=` keyword, or the positional message of `skip`;
  a reason that is an empty string does not count), `pytestmark = ...` the same way,
  `pytest.skip()` and `pytest.xfail()` without a message, `@unittest.skip*` and
  `@unittest.expectedFailure` without a reason, `self.skipTest()` and `raise SkipTest` without a
  message, and a test that opens with `if condition: return`. The subject names the form, so the
  message says which one to fix. `sleep-in-test` (TypeScript:
  `nitpicker/no-fixed-sleep-synchronization`) reports `time.sleep`, `asyncio.sleep`, `trio.sleep`,
  `anyio.sleep` and `gevent.sleep` with a delay other than a literal `0` (`asyncio.sleep(0)` only
  yields), also through a star import (`from time import *`), and Playwright's `wait_for_timeout`.
  It ignores tests that patch the sleep or freeze the clock, and follows the project's own helpers
  that sleep, star imports included. A poll is the allowed form, so a sleep is not reported in the
  body of a `while` loop of the same function with a condition, of a `while True` (or `while 1`)
  loop that reads the clock (`time.monotonic()`, `time.perf_counter()`, `time.time()`,
  `datetime.now()`, `loop.time()`, trio's or anyio's `current_time()`) as a deadline, or of a `for`
  loop whose body leaves early under a condition (a `break` of that loop or a `return` inside an
  `if`, `try` or `match`, as in `for _ in range(50): if ready(): break`). A `while True` loop
  without a clock read is reported, as in the Java and Kotlin presets, because nothing bounds it. A
  `for` loop that only repeats the wait, the `else` of a loop and a comprehension are reported, and
  so is `wait_for_timeout` in a loop, because Playwright's `expect` already polls. As in the Java
  preset, a sleep in code that runs off the test's path is not reported: a function or lambda
  handed to a thread or executor (`Thread(target=...)`, `Timer`, `submit`, `run_in_executor`,
  `asyncio.to_thread`, `start_new_thread`) or used as a mock's `side_effect` (keyword or
  assignment). `negative-wait-in-test` (Java: `NegativeWaitInTest`; TypeScript: the timeout-based
  negative assertion of `nitpicker/no-fixed-sleep-synchronization`) reports a wait that the test
  expects to run out: `assert not event.wait(0.5)`, `lock.acquire(timeout=1) is False`,
  `assertFalse(x.wait(...))`, and the first call with a delay (`timeout=`, `asyncio.wait_for(x,
t)`, `asyncio.timeout(t)`, `fail_after(t)`, `wait(t)`) inside `pytest.raises` or `assertRaises`
  of `TimeoutError`, `queue.Empty` or `TimeoutExpired`. Such a test passes only after the full
  delay. A delay of `0` or `None` is not reported. Only a real wait counts: a `wait`, `wait_for`,
  `get`, `join`, `acquire`, `result` or `communicate` call, a `timeout` or `fail_after` scope, a
  `subprocess.run`-style call with a `timeout`, or a project helper named `wait_*`, `*_until` or
  `poll*` called with `timeout=`. A call on something the test binds to a mock (`Mock()`,
  `MagicMock()`, `patch(...)`, or whose `side_effect` or `return_value` it sets) waits for nothing;
  the binding is matched by its full path (`self.api` mocked leaves `self.jobs` real), and the one
  that counts is the last assignment before the call, so a name rebound from a mock to a
  `Queue()` waits again. `assert not proc.wait(timeout=5)` on a `Popen` checks an exit code of 0. `real-clock-in-test` and `random-in-test` skip a
  file that uses `freezegun`, `time_machine`, a patched clock, a seed or a `random.Random(...)`, and
  look at the fake per test function, not per file. `network-in-test` skips files that use
  `responses`, `respx`, `requests_mock` and similar or patch the client, and tests under
  `integration`, `e2e` and the like. `tautological-assert` covers `assert True`, `assert x == x`,
  `assert 1`, `assertTrue(True)`, `assertEqual(x, x)`, `assertGreaterEqual(x, x)`,
  `assertIsInstance(x, object)` and the like: asserts that cannot fail.
- `mocked-subject-in-test` (Java and Kotlin: `MockedSubjectInTest`; TypeScript:
  `nitpicker/no-mocking-subject-under-test`) reports a test that replaces the code it is named after.
  The subject is the module a test file is named for (`tests/test_cart.py` or `cart_test.py` for the
  one project module `cart.py` or `cart/__init__.py`, or the one of them the test imports). Reported:
  `patch`, `mocker.patch`, `patch.multiple` or `monkeypatch.setattr` of a function or class the
  subject module defines (`patch("shop.cart.total")`, `patch("shop.cart.Cart.total")`);
  `patch.object` or `monkeypatch.setattr` on the subject module, on one of its classes, or on an
  instance of one (built in the test or returned by a fixture of the file); a method of such an
  instance replaced by a `Mock`; and `Mock(spec=Cart)` or `create_autospec(Cart)`. Patching what the
  subject imports (`patch("shop.cart.requests.get")`, the usual Python seam), a module constant
  (`patch("shop.cart.LIMIT", 1)`) or another module is not reported; #519 covers patch targets that
  miss. Allowed: pass the collaborators in and give the test a fake of them, and test a helper
  through the public function that calls it.
- `global-state-leak-in-test` (Java and Kotlin: `GlobalStateLeakInTest`; TypeScript:
  `nitpicker/fake-timers-require-restore`) reports, in a test file, a direct change to process-wide state that nothing
  puts back: `os.environ[...] = ...`, `del os.environ[...]`, `os.environ.update`, `setdefault`, `pop`, `popitem` and
  `clear`, `os.putenv` and `os.unsetenv`, `time.tzset()`, `locale.setlocale(category, value)` (the one-argument query
  is not a change), and an assignment to an attribute of an imported project module or class (`settings.DEBUG = True`).
  `monkeypatch.setenv`, `monkeypatch.setattr` and `mock.patch.dict(os.environ, ...)` are the allowed forms: pytest and
  `mock` undo them. A direct change counts as restored when the same state is set again in a `finally` of the same
  function, after `yield` in a fixture, in `tearDown`, `tearDownClass`, `asyncTearDown`, `teardown_method`,
  `teardown_class`, `teardown_function`, `teardown_module` or `tearDownModule` (or a function one of them calls), or
  by `importlib.reload` of the module; a cleanup the function registers (`addCleanup`, `request.addfinalizer`,
  `enterContext`, `ExitStack.callback`) counts when its arguments name the state (`os.environ.pop`) or a function
  that restores it, and that function itself is a restore site. A change inside `with mock.patch.dict(...)` or a
  function decorated with `@mock.patch.dict(...)`, in a `pytest_*` hook, or at the top level of a module (it runs
  once, at import) is not reported, and in a test-support module without tests a restore anywhere in the module
  counts. `process-env-access` does not run on tests, so it does not overlap.
- `server-or-container-per-test` (Java and Kotlin: `ServerOrContainerPerTest`; TypeScript:
  `nitpicker/no-server-or-worker-per-test` and `nitpicker/no-node-process-per-test`) reports a
  container, server, process or git repository started for each test: a `testcontainers` class
  named `*Container` or `DockerCompose`, `uvicorn.run` or `uvicorn.Server`, `subprocess.Popen`,
  `asyncio.create_subprocess_exec`, `multiprocessing.Process`, an `http.server`, `socketserver`,
  `werkzeug` or `wsgiref` server, `aiohttp.web.run_app`, `git.Repo.init`/`clone_from`, `pygit2`
  or `dulwich` repository creation, or a `subprocess.run`-style `git init`/`git clone` (also after
  `-C path`). A process the function waits for (`.wait()`, `.communicate()`) is a short command,
  not a server, and is not counted. It is reported in a fixture with the default `function` scope
  that runs two or more times: the tests that request it by parameter, `usefixtures` or a module
  `pytestmark`, the cases of a literal `parametrize`, the `params` of the fixture, the
  function-scoped fixtures that request it, and every test in reach of an `autouse` fixture. A
  test counts for the closest fixture of that name (its class, its module, then the nearest
  `conftest.py` above it), so a fake that overrides it lower down takes those tests away. It is
  also reported in `setup_method`, `setUp`, `asyncSetUp` of a test class and `setup_function`,
  and when two or more tests of one module or class make the same call with the same arguments.
  A fixture with a wider `scope` and a fixture used once are not reported. Fixtures that a
  `conftest.py` loads from another module (`pytest_plugins`, a star import) and
  `request.getfixturevalue(...)` are not followed.
- A test function with no assertion is not checked here; the conventions work owns it, together
  with the detection of the project's own assertion helpers.
- Touched code: a new finding is reported per site, and the rules in `touched-rules.mjs` (every
  `python-rules` id, and ruff's `BLE001`, `ERA001`, `PLR2004`, `PLW0602`, `PLW0603`, `S102`, `S307`,
  `S602`, `S604`, `S605`, `T201`, `T203`) are strict: a finding on a line the change adds or edits
  is new even when the base had a finding of the same rule in that file, so code that is touched
  is held to the rule while untouched legacy stays baselined. The repeats of one subject in a file
  are numbered `#2`, `#3`, and base and head repeats are paired by line, so a new site never hides
  behind an old one and the new one is the one on the added line. A line ruff format or black only
  reformatted is not an edited line.
- Deprecation: mypy runs with `--enable-error-code deprecated` when it is version 1.14 or later (the
  code does not exist before), and the generated pyright config sets `reportDeprecated` to
  `error`, so using an API marked `@deprecated` is a finding in each checker.
