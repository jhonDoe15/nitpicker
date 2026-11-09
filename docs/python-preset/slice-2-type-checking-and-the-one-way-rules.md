# Slice 2: type checking and the one-way rules

Part of the [Python preset guide](../python-preset.md).

The purpose of this slice is the "one way" for each construct. Every finding message names the
allowed form, and, because any rule can flag legitimate code, ends with how to add the exception.
Every enforceable finding of ruff, the type checkers, the rules, coverage, duplicates, coupling, import-linter, the dependency checks, the test times and mutmut ends with the one exception sentence (`If this is intended, add {"rule":"<rule>","paths":["<path>"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.`), except mypy `unused-ignore` (delete the comment), `no-import-outside-roots` (whose way out is `python.sourceRoots`), findings on `.`, the shared file and size limits, `slow-test`, the [feature folder rules](feature-folders.md) and the function rules (the function limits, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`, `mutant-survived`, `mutant-nocoverage`), whose message names the top-level `exceptions` entry, with `function` for the function rules, instead. The allowed forms live in `languages/python/rules/hints/` and the route in one place, `exceptionSentence` in `languages/python/rules/rule-hints.mjs`, which assembles them and applies them to both analyzers' findings with `applyRuleHints`; `languages/python/rules/exception-sentences.test.mjs` fails on any other Python file that writes a route of its own, and a test checks that each rule's message
names its allowed form, and an opt-in test runs a banned and an allowed fixture of every rule
through the real tools.

- **Type checking.** `mypy --strict`, `pyright` or `basedpyright` with `typeCheckingMode: strict`, on the source
  roots. Strict is not configurable: a project that cannot pass yet baselines its existing errors
  (they only count when new), and a project's config cannot switch the check off unless it opts in
  with `tools.pyright` or `tools.mypy` (below). Only its environment settings apply. For mypy that is
  `plugins`, `mypy_path`, `python_version`, the namespace and typeshed options and, per module,
  `ignore_missing_imports` and `follow_imports` for modules the project does not own; a section for
  one of its own packages or modules (found under the source roots and under the `mypy_path`
  directories, as `.py` or `.pyi` files, directories and `-stubs` packages), or for a pattern that
  starts with `*`, is dropped, as are `ignore_errors`, `disable_error_code`, `exclude` and every flag that
  weakens strict. Pyright gets a generated config in the report directory holding the project's
  environment keys (`venv`, `venvPath`, `pythonVersion`, `pythonPlatform`, `stubPath`,
  `typeshedPath`, `extraPaths` and the root, `extraPaths`, version and platform of each
  `executionEnvironments` entry, paths made absolute, following `extends`), then forces strict,
  `enableTypeIgnoreComments: false`, `ignore: []`, the source roots and nitpicker's `exclude`; its
  `report*` overrides, `include`, `exclude`, `ignore` and `strict` are never read. basedpyright runs the same way, with the
  same generated config, and the same strict mode: it names its modes `off`, `basic`, `standard`,
  `strict`, `recommended` and `all`, and nitpicker forces `strict` (not `all`, whose extra rules such as
  `reportAny` and `reportUnusedCallResult` are style opinions, nor `recommended`, its default), so the
  two checkers report the same rules. The project config is `pyrightconfig.json` (first) or the
  `[tool.basedpyright]` / `[tool.pyright]` table (basedpyright does not read a
  `basedpyrightconfig.json`, so neither does nitpicker), and a baseline file
  (`.basedpyright/baseline.json`) is not read. Mypy takes the first of `mypy.ini` and `.mypy.ini`
  that exists, even without a `[mypy]` section (its `[mypy-...]` sections still apply, as in mypy
  itself), then `pyproject.toml` or `setup.cfg` only with a mypy table or section. Mypy also gets the environment's
  interpreter (`--python-executable`), so packages installed there resolve. Tests are not
  type-checked unless a source root contains them. Findings are one per diagnostic: tool `mypy`, `pyright` or `basedpyright`, rule the
  error code (`arg-type`) or rule name (`reportArgumentType`), identity the message text without `on line N` / `from line N` references (ruff messages such as F811 too), with `#n` for repeats in one file. Only the first line of a pyright or basedpyright message is used, since
  the detail lines vary with surrounding code. A checker that exits other than 0 or 1 is a
  `types-failed` tool error. The checker runs in the project's environment like pytest, so it must
  be installed there (or on the `PATH`).
- **Opting in to the project's checker config.** `"tools": { "pyright": { "precedence": ["project", "nitpicker"] } }`
  (it covers basedpyright) or `"mypy"` lays the whole project config over nitpicker's strict
  settings: a key the project sets wins, a key it leaves out stays strict. For mypy the generated
  config starts with `strict = true` (and `--strict` is left off the command line, since a flag would
  override the file), then the project's global options and every per-module section, own modules
  included. The project's `exclude` is written as it is (an inline `(?x)` keeps working) and
  nitpicker's `exclude` globs go to the command line as `--exclude`, which mypy adds to it. For
  pyright the project's keys replace the generated ones (`include`, `exclude` and `extraPaths` are
  merged instead, and each `executionEnvironments` entry keeps nitpicker's import roots). The config
  is read from the head checkout for both sides of the comparison, and every source path in it
  (`include`, `exclude`, `extraPaths`, `stubPath`, an environment's `root` and `extraPaths`) is
  resolved against the checkout that is being checked, so the base run checks base files; `venv`,
  `venvPath` and `typeshedPath` stay where the environment is. With the opt-in pyright also looks
  for `pyrightconfig.json` or a `pyproject.toml` with the table in the parent directories up to
  the repository root. The config files, the `extends` chain included, are part of the cache key,
  and an edit of the checker's own settings in them is a policy change a person reviews (see
  [Type checker and mutation configs](../usage.md#type-checker-and-mutation-configs-python-preset)).
  Naming `"project"` without a config is a tool error, and so is a config that cannot be parsed (the
  message says so and names the file). `["nitpicker", "project"]` reads only what the unlisted
  behavior reads. Without the opt-in the run prints
  `Ignoring [tool.pyright] in pyproject.toml except its environment keys; opt in with ...` once. The code is in
  `languages/python/adapters/project-tools/`.
- **Lint rules.** `languages/python/ruff/nitpicker-ruff.toml` selects, besides slice 1's rules,
  `PTH`, `UP031`, `UP032`, `FLY002` and `BLE001`, and ignores `F405`
  (the star import itself is `F403`), `SIM105` (the `swallowed-exception` rule below covers that
  form) and `RUF100` (every `noqa` is already a finding). `S110` and `S112` are not selected:
  `swallowed-exception` reports what they did, and more, once and under one id. The shared
  one-way rules add the groups `G` (logging calls), `N` (PEP 8 naming), `ERA` (commented-out
  code), `ARG` (unused arguments), `DTZ` (datetimes without a zone), `PT` (pytest style), `S` (security)
  and `TRY` (exceptions), the pitfall groups `ASYNC`, `LOG`, `PLE`, `PLW` and `T10`, and the single rules
  `PLR2004`, `PLW0602` and `PLW0603`; the last section of this slice lists each one with its allowed form
  and the rules of those groups that are left off. The groups `RUF`, `G`, `N`, `DTZ`, `PT`, `S`, `TRY`,
  `ASYNC`, `LOG`, `PLE`, `PLW` and `T10` are selected by listing their stable codes, not by prefix, so a
  later ruff cannot add a rule (or a preview rule) to the gate. `ruffConfigFor`
  (`adapters/configuration/python-ruff-config.mjs`) writes the toml into the report directory
  without the codes that the installed ruff does not know or lists as preview or removed
  (`ruff rule --all --output-format json`), which lets ruff 0.9 up to 0.16 run the same selection;
  a prefix such as `E4` or `T20` stays when a known rule starts with it. Test files are the ones
  pytest collects (the `python_files` patterns, `testpaths`, `conftest.py`, any `tests` or `test`
  folder, `test_*.py`, `*_test.py`, and the Django names in a Django project, see
  [runner parity](runner-parity.md)): ruff's `ARG`, `DTZ`, `PLR2004`, `S` and `ASYNC251` findings in them are
  dropped after ruff runs (`rules/filters/ruff-allowed-forms.mjs`). The `DTZ` codes are not in the touched-code list of `touched-rules.mjs`, like `ARG`: a datetime site that is added on an edited line is new only when its identity differs from the base's, so the base's findings of the same code in that file stay baselined. `datetime.strptime(...).date()` and `.time()` are allowed (`DTZ007`), since a calendar value has no zone. Security findings (ruff `S` and the
  `sql-string-formatting`, `tls-verification-off`, `weak-hmac`, `http-without-timeout` and
  `unsafe-deserialization` rules) are also dropped in test support that pytest does not collect, as in the
  TypeScript preset. Test support is every file under a test root (the configured pytest `testpaths`, and
  any `tests` or `test` folder) and `conftest.py`; a `testing`, `test_support`, `test-support`, `test_utils`,
  `test_helpers`, `testutils`, `test_fixtures`, `fixtures`, `__fixtures__`, `mocks`, `__mocks__`, `fakes` or
  `stubs` folder, or a file named `testing.py`, `testutils.py` or `fixtures.py`, counts only inside a test
  root or when no production module imports it (directly or through other support files). A production
  `testing/` or `fixtures/` package that the application imports keeps its findings. The rules script
  decides the support files (`security/support.py`) and lists them in `rules-allowances.json` beside its
  report, where `rules/filters/test-support.mjs` reads them for ruff's findings.
- **AST rules.** `languages/python/rules/nitpicker_rules.py` runs with `python -I` (standard
  library only, never importing project code) over the files `ruff check --show-files` lists, so
  it sees exactly the files ruff lints, honoring `.gitignore`. Findings have tool `python-rules`.
  Files that do not parse are left to ruff's syntax errors. The script needs Python 3.10 or newer (every
  Python still supported upstream); on an older project interpreter it runs no check and reports one
  `python-rules/rules-skipped` tool error that names the version it needs and the one it found. A security
  check that fails on a file is reported as a `python-rules/rules-check-failed` tool error naming the check
  and the file; that file has no findings of that check, and every other check and file still runs.

| Allowed form                                                     | Banned form                                                                  | Rule                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `pathlib.Path`                                                   | `os.path`, `open()`, `os.getcwd()`, ...                                      | ruff `PTH*`                                                |
| f-strings                                                        | `"...".format()`, `"..." % x`, `"".join` of a fixed list                     | ruff `UP031`, `UP032`, `FLY002`                            |
| `None` default, value built in the function                      | a mutable default argument                                                   | ruff `B006`                                                |
| catch and handle a specific error, or re-raise                   | bare `except:`, `except Exception:`                                          | ruff `E722`, `BLE001`                                      |
| re-raise, return a failure value or a default                    | `except X:` that only passes, continues, logs, returns or assigns a constant | `swallowed-exception`                                      |
| `contextlib.suppress(SpecificError)`                             | `contextlib.suppress(Exception)`, `BaseException` or no argument             | `blind-suppress`                                           |
| explicit imports                                                 | `from module import *`                                                       | ruff `F403`                                                |
| `logging` (or the project's structlog, loguru)                   | `print`, `pprint`                                                            | ruff `T201`, `T203`                                        |
| a `TextIO` parameter, `out.write(...)` or `print(..., file=out)` | `sys.stdout`, `sys.stderr` outside the entry point                           | `process-stream-access`                                    |
| log the caught exception itself                                  | logging only `str(error)` or an f-string with it in an `except`              | `catch-log-without-exception`                              |
| a test that asserts                                              | a test function with no assertion                                            | `test-without-assertion`                                   |
| the constant by name in a test                                   | a test literal that copies the value of a constant it can see                | `copied-constant-in-test`                                  |
| one case per test, asserted outright                             | an assertion inside a branch, loop, `except` or comprehension                | `conditional-assertion-in-test`                            |
| a skip on a real condition, a strict `xfail`                     | a permanent skip, a literal `skipif`, a non-strict `xfail`                   | `switched-off-test`                                        |
| `@dataclass(frozen=True)`                                        | `@dataclass` without `frozen=True`, outside tests                            | `frozen-dataclass`                                         |
| the validation library in `adapters/` only                       | importing pydantic (or the declared library) elsewhere                       | `pydantic-boundary`                                        |
| an `enum.Enum` / `StrEnum`                                       | a plain class of two string constants, or three `X_*`                        | `enum-string-constants`                                    |
| fixing the code                                                  | `# type: ignore`, `# noqa`, `# pyright: ignore`, ...                         | `no-inline-suppression`                                    |
| annotated code the checkers read                                 | `@no_type_check`, `if not TYPE_CHECKING:`, a stub beside                     | `no-type-check`, `not-type-checking`, `stub-beside-source` |
| a docstring that says what the name cannot                       | a docstring that restates the name, or over 5 lines                          | `doc-comment-content` (top-level `exceptions`)             |
| one plural input, a one-element list                             | optional `tag` beside optional `tags: list[...]`                             | `singular-and-plural-field`                                |
| `match` or `if`/`elif` ending in `assert_never`                  | `x == E.A or x == E.B` over some members of an enum                          | `exhaustive-enum-predicate`                                |
| calling (or importing) the target directly                       | a module-level function that only forwards to another                        | `forwarding-wrapper`                                       |
| a parameter some real call passes                                | an optional parameter (with a default) that no call passes                   | `unused-option`                                            |

Details that are decisions rather than the table:

- `frozen-dataclass` and `pydantic-boundary` do not apply to test files, where fakes mutate and
  tests exercise the adapters. Test files are the same everywhere in this preset: `test_*.py`,
  `*_test.py`, `conftest.py`, the project's pytest `python_files`, Django's `tests.py`,
  `tests_*.py` and `*_tests.py` in a Django project only, anything under a `tests` or `test`
  directory at any depth, and anything under a `testing` directory at the project root (next to
  `src/` or the package). A `testing` package inside the package (`shop/testing/`, like
  `numpy.testing`) is shipped code and is checked as production (`isTestFile` in
  `configuration/pytest/collection-options.mjs`, with `TOP_LEVEL_TEST_DIRECTORIES` from
  `execution/python-project.mjs`; the rules script gets the list of test files from it). `frozen=True` must be the literal `True`.
- The validation library is the one the project declares, read from `pyproject.toml` (PEP 621
  `dependencies`, `optional-dependencies` and `dependency-groups`; Poetry, uv and pdm tables),
  `requirements*.txt` (also under `requirements/`), `setup.cfg`, the literal `install_requires` and
  `extras_require` of a `setup.py` and a `Pipfile`: pydantic, attrs
  with cattrs, marshmallow, msgspec, dataclasses-json, voluptuous or cerberus. Runtime
  dependencies come before development ones, and when several are declared all of them are
  guarded. `pydantic-boundary` then flags importing any of them (`cattrs` for attrs, which is also
  the domain's record library, so `import attrs` stays allowed) outside `adapters/`, and the
  message names the declared libraries and the first one's parse call (`Schema().load(data)`);
  with none declared it guards pydantic and says so. The requirements files follow `-r` includes
  of any path inside the project (once each), skip constraints files, read the `.in` file next to
  a compiled `.txt` and, for a compiled file without one, only the direct dependencies (the
  entries `# via -r ...`), and decode a byte order mark or UTF-16. The detection is
  `languages/python/rules/libraries/project-libraries.mjs` over the dependency reader
  `languages/python/libraries/python-dependencies.mjs`; the rules step hands the import roots it
  guards to the script as `boundaryRoots`.
- The logger is read the same way: `structlog` or `loguru` when declared, else the standard
  library. The `print` message and the `catch-log-without-exception` message name that logger's
  form (`structlog.get_logger()`, `from loguru import logger`).
- `catch-log-without-exception` flags a `warning`, `warn`, `error` or `critical` call on a logger
  in an `except ... as name:` body that uses the caught name, or a value built from it, without
  keeping the traceback. The traceback is kept by `logger.exception(...)`, `exc_info=` (anything
  but `False` or `None`), loguru's `logger.opt(exception=...)` and structlog's `exc_info`, and
  by a handler that re-raises after logging (a bare `raise`, `raise error`, or
  `raise Other(...) from error`). Passing the caught name as an argument (`logger.warning("failed:
%s", error)`), as a field (`error=error`) or in `extra=` does not keep it, nor does
  `str(error)` or an f-string, so those are flagged. A call in a nested handler that uses the outer
  name is checked for the outer handler too. A logger is a name bound from `logging.getLogger` or
  `structlog.get_logger`, loguru's `logger`, or a receiver called `logger`/`log`/`..._logger`;
  `logging.error(...)` counts too. A handler that does nothing but log is reported once, as
  `swallowed-exception` (logging alone is not handling), so `catch-log-without-exception` looks only
  at handlers that handle the error some other way, and a log call that does not use the caught
  name is not its concern.
- `test-without-assertion` flags a `test_*` function (or method of a `Test*` class or a
  `TestCase`) in a test file pytest collects (the files of `testFiles`) that has no `assert`, no `raise AssertionError`,
  no `pytest.raises`/`warns`/`fail`/`skip`/`xfail` or `self.fail`/`self.skipTest` (a bare `fail`
  or `skip`, or another receiver, does not count), no call whose name starts with `assert` on a
  receiver (`self.assertEqual`, `mock.assert_called_once`) or imported from a library
  (`from assertpy import assert_that`), no imported `expect`, no pytest-check call or
  `with check:` (when `pytest_check` is imported), and no call to one of the project's assertion
  helpers. A function decorated with `@fixture` or `@pytest.fixture` is never a test, whatever its
  name. Tests marked `skip`, `skipif` or `xfail` are exempt. A helper is followed only with proof:
  it is defined as a `def` in a test directory, a `conftest.py`, a `test_*.py` file or a
  `testing`/`assertions` module and its own body asserts (an `assert`, `self.assert*`,
  `pytest.raises`, `pytest.fail` or a `raise`; not through a nested function or lambda), and it
  is the last call of tests that have no other assertion in at least three test files. The name
  alone never counts, and tests that already assert do not vote. A call counts when it is bare,
  `self.name(...)` or qualified by a project test module (`helpers.check_total(...)`), never on an
  arbitrary receiver. A smoke test that deliberately asserts nothing takes a `python.exceptions`
  entry for `test-without-assertion`.
- `copied-constant-in-test` flags a string, integer or float literal in a collected test file that
  equals the value of a module-level `UPPER_SNAKE` constant (`NAME = 50`, `NAME: Final = "eu"`, a
  negative number too) declared in a production module the test imports (`import a.b`,
  `import a.b as x`, `from a.b import ...`, `from a import b`). Test files, `test_*.py` and `*_test.py`
  modules and the test support files (`conftest.py`, the `tests`/`test` folders and `testpaths`, and the
  `testing`, `fixtures`, `mocks` and other support folders that production code does not import, as
  for the security rules) declare no constants; booleans, `None`, bytes
  and f-strings are not values. Not reported: the numbers -1, 0, 1 and 2, strings shorter than three
  characters or blank, a literal whose statement also names the constant
  (`assert limits.MAX_ITEMS == 50` pins the value on purpose; a lambda counts as its own statement), docstrings, imports,
  annotations, `ids=` and the argument names of `pytest.mark.parametrize`, and `id=` of
  `pytest.param`. Numbers compare by value (`5000` matches `5000.0` and `5_000`), as in the other presets. A value declared in
  two imported modules is one finding naming all of them, sorted, joined by `or`.
- The boundary is a directory named `adapters` anywhere in the path (`src/shop/adapters/api.py`),
  as in the TypeScript preset; a project that keeps its models elsewhere (`schemas/`,
  `api/`) adds a `python.exceptions` entry for `pydantic-boundary` with those paths.
- `enum-string-constants` flags a class with no bases or decorators whose body assigns at least two
  `UPPER_CASE` names to string literals, and module-level `UPPER_CASE` string constants where at
  least three share the prefix before the first underscore (`STATUS_ACTIVE`, `STATUS_CLOSED`, ...),
  but only when the group is enum-like: each value equals its name, or the name after the shared
  prefix, ignoring case (`ACTIVE = "active"`). Configuration (`DB_HOST = "localhost"`,
  `class Defaults: HOST = "localhost"`) is not flagged. Subjects are the class name or `PREFIX_*`,
  so identities survive edits above them. The hint offers `enum.StrEnum` on Python 3.11 and later
  and `class X(str, enum.Enum)` before.
- `no-inline-suppression` reads real comments only (the tokenizer, not string contents). It bans
  `# type: ignore`, `# noqa`, `# ruff: noqa`, `# flake8: noqa`, `# pyright: ignore`, the
  `# pyright: basic|standard|off` modes and `# pyright: reportX=false|none|warning|information`,
  `# fmt: off` and `# fmt: skip`, and any `# mypy:` directive except `strict`. The message says
  to remove the comment and fix the code; when it must stay, the way out is a `python.exceptions`
  entry for `no-inline-suppression` itself with the path. `# pyright: strict` is allowed. Mypy has no switch
  that ignores `# type: ignore` comments, so there the comment still silences the checker; the
  rule reports it all the same, and pyright is run with `enableTypeIgnoreComments: false`.
- `no-type-check`, `not-type-checking` and `stub-beside-source` close the other ways to hide code
  from the checkers: `@no_type_check` on a function or class, an `if not TYPE_CHECKING:` branch,
  and a `.pyi` beside a `.py` of the same stem in the sources (mypy then ignores the `.py` body).
  `typing.cast` is allowed.
- `swallowed-exception` flags an `except` handler whose body does nothing with the error (a handler
  of an asyncio, Trio or AnyIO cancellation inside `async def` is judged by
  `cancellation-not-propagated` instead, see [Cancellation propagation](cancellation-propagation.md)): every
  statement is `pass`, `...` or another constant expression such as a docstring, `continue`, an
  assignment of a constant (`result = None`, `ok = False`), `return` with no value or a constant
  (`None`, `False`, `0`, `-1`, a string, or an empty or constant-only tuple, list, set or dict such
  as `[]`, `()` or `{}`), or only reports the error: a call on a logger (`logger.exception(...)`,
  `logging.warning(...)`, `logging.getLogger(...).error(...)`), `print`, `warnings.warn` or
  `traceback.print_exc`. Logging alone is not handling: the failure disappears from the caller's
  point of view, as in the TypeScript `nitpicker/no-silent-catch` and the Java preset. A handler that raises, calls anything
  else, assigns or returns a name or computed value (a failure value built from the error, or a
  named default) is allowed, with or without a log call next to it, and so is one that uses the
  bound name (`except E as error: ...`) in a way that is not a log call. The one exception
  inside the list is the optional-dependency idiom: a handler that catches only `ImportError` or
  `ModuleNotFoundError` may assign constants (`except ImportError: yaml = None` or
  `HAS_YAML = False`); an `except ImportError:` that only passes or returns is still flagged. It replaces ruff's
  `S110` (`pass`) and `S112` (`continue`), which missed `return None`, `...` and the rest, and applies to
  test files too. `break` is not in the list, since it ends the loop rather than ignoring one item.
  The subject is `except <type>` (`except (A, B)`, plain `except` for a bare one), so identities
  survive edits above; repeats in a file are numbered. The message says to re-raise it with its
  cause (`raise DomainError(...) from error`), return a failure value built from it or a named
  default, that logging alone is not handling, that `contextlib.suppress(SpecificError)` ignores
  one expected error, that a test uses `pytest.raises(SpecificError)` (`self.assertRaises` in unittest), and the `python.exceptions` entry for `swallowed-exception` for a handler that
  must stay (a lookup that answers `False` for bad input, say). Untested `except` handlers are not
  gated by branch coverage either, since coverage.py emits no arcs for them.
- `blind-suppress` closes the way around the rule above: `contextlib.suppress(Exception)`,
  `suppress(BaseException)` (also `builtins.Exception`, an import alias, and a list holding either
  of them) and `suppress()` with no argument ignore every error, as the bare `except Exception:` it
  stands for. The subject is the call as written with the resolved name, for example
  `contextlib.suppress(Exception)`; a `suppress` imported from anywhere other than `contextlib` is
  not checked. The message points to naming the expected exception, or handling or logging the
  error, to `pytest.raises` in a test, and to the `python.exceptions` entry for `blind-suppress`.
- `ruff check` runs with `--ignore-noqa`, so a `noqa` never hides a finding either.

The slice continues on these pages:

- [The shared one-way rules](the-shared-one-way-rules.md)
- [Rules from code review](rules-from-code-review.md)
- [Slow tests](slow-tests.md)
- [New console output from tests](new-console-output-from-tests.md)
- [Cancellation propagation](cancellation-propagation.md)
