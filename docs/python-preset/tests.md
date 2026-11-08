# Tests

Part of the [Python preset guide](../python-preset.md).

- `core/command/python/python-cli-*.test.mjs`: fast, always on. The CLI end to end with a fake
  toolchain: the tools of a `.venv/bin` are wrapper scripts that start
  `languages/python/adapters/fixtures/fake-python-tools.mjs`, which calls `runFake` of
  `languages/python/adapters/test-support/fake-tools/`. The harness runs the analyzers in process
  through `runTasksInProcess`, as the Java CLI tests do, and hands it `spawnFakeTools`, which
  `createToolContext` takes as `spawn`: calls to an installed fake tool run `runFake` in the test
  process, every other call starts a real process. The runner entry (`runPython`) is the same
  function the process entry calls, and one test runs it as a child process (`subprocess: true`) to
  pin the process boundary. They cover clean and failing changes in every report format, a change that
  removes every test, tool errors (failing tests, no environment), `--all`, rejected TypeScript-only
  keys, and that base and head each run with their own sources on `PYTHONPATH`. One test per
  behaviour that no unit test below covers. The Python end-to-end suite starts the runner as a
  program. Environment detection (`poetry`, `uv`, `pip`) always starts real programs, which the
  environment tests replace with shell scripts on `PATH`. The project directory controls the fake:
  - `fail.json`: { "<tool>" or "<tool> <subcommand>": "message" }: that call exits 2 with the message on stderr (`--version` always works)
  - `violations.txt`: one `rule|path|message` per line: ruff check findings
  - `unformatted.txt`: one path per line: files ruff format / black would reformat
  - `test-exit.txt`: exit status of `coverage run` (default 0); its output says the tests failed
  - `junit.xml`: written as the pytest JUnit report when `coverage run` passes --junitxml (default: one passing test, or one failing test when test-exit.txt is 1)
  - `coverage-data.json`: written as the coverage.py JSON report (default: no files)
  - `parallel-coverage.txt`: `coverage run` leaves a per-process data file next to $COVERAGE_FILE
  - `unparsable.txt`: one path per line: files the formatter cannot parse (it exits like the real formatter does and names them on stderr)
  - `no-pytest.txt`: `python -c "import pytest"` fails
  - `no-<name>.txt`: the version probe of that distribution (Django, nose2) fails; it prints 5.1.0 otherwise
  - `pytest-cov.txt`, `xdist.txt`, `rerunfailures.txt`, `pytest-django.txt`: the pytest probe reports that plugin as installed
  - `ruff-rules.json`: printed by `ruff rule --all` (default: that call exits 2, as an old ruff does)
  - `sources.txt`: one path per line: what `ruff check --show-files` lists (default: every .py file below the project, except .venv)
  - `type-errors.txt`: printed by mypy as its report (exit 1 when not empty)
  - `mypy-version.txt`: the version mypy prints for --version (default 1.13.0)
  - `pyright.json`: { generalDiagnostics } printed by pyright and basedpyright as their report, relative files made absolute (exit 1 when it has diagnostics)
  - `rules.json`: written by the nitpicker rules script (default: no findings)
  - `structure-data.json`: written as the structure metrics report of `python structure_metrics.py` (default: no functions)
  - `classes-data.json`: written as its classes report (default: no classes)
  - `no-mutmut.txt`: the mutmut version probe fails
  - `mutmut-version.txt`: the version the mutmut probe prints (default 3.8.0)
  - `mutants-data.json`: { "<source path>": { "exitCodes": {...}, "mutated": "<text>" } }: what `mutmut run` leaves in mutants/ (default: an empty mutants/)
  - `mutmut-exit.txt`: exit status of `mutmut run` (default 0); 1 says no mutant is covered, any other status says the clean test run failed
  - `mutmut-output.txt`: what `mutmut run` prints instead of those messages
  - `mutmut-failing-tests.txt`: one test module per line: `mutmut run` fails its stats run until PYTEST_ADDOPTS ignores each (`python pytest_timings.py` writes junit.xml for them)
  - `mutmut-only-failing.txt`: with those ignored, no test is left (the stats run collects none)
  - `python-version.txt`: the `major.minor` the interpreter version probe prints (default 3.12)
  - `import-scan.json`: printed by the import scan script (default: no imports)
  - `distributions.json`: printed by the distribution scan script (default: Python 3.12, nothing installed)
  - `lint-imports.txt`: printed by lint-imports (default: a report with no broken contracts); its exit status is 1 when the text says BROKEN
  - `python -c` with `sys.executable` prints `$VIRTUAL_ENV/bin/python` and always works. When
    `FAKE_PYTHON_LOG` is set, every call appends a JSON line with the tool, arguments, cwd,
    `PYTHONPATH`, `MYPYPATH`, `PYTEST_ADDOPTS` and `DJANGO_SETTINGS_MODULE`.
- Unit tests next to the code: environment (including uv, poetry and workspace launchers), formatter,
  test runner, target version and source root detection, the tool steps (arguments, long output,
  missing tools, unparsable files), the runner (exclude, legacy inventory, messages) and its
  arguments, the analyzer and its configuration files, config validation and the coverage ingester
  (on a real coverage.py report).
  The mutmut ingester runs on the recorded run data of a real mutmut 3.8 run
  (`languages/python/ingest/fixtures/mutmut-run.json`); the reuse check runs against real work trees
  of a repository and a real `python3` for the import scan; the fake `mutmut` writes a `mutants/`
  directory from a `mutants-data.json` in the project and logs which result files it found there.
- `languages/python/adapters/e2e/red-base/python-preset-red-base.e2e.test.mjs`: gated behind `NITPICKER_PYTHON_E2E=1`
  too. A base whose test fails and a head that repairs it passes with a note; a new violation or an
  edited untested legacy function still fails next to the red base.
- `languages/python/adapters/e2e/*.e2e.test.mjs`: gated behind `NITPICKER_PYTHON_E2E=1`
  (`npm run test:python`). Needs python3 3.10 or newer, uv, ruff, black, mypy, pyright, coverage and
  pytest on the `PATH` and network access to PyPI (it installs pytest, pytest-cov, pytest-xdist,
  coverage, mypy, mutmut, black and import-linter into throwaway environments); 8 to 25 minutes
  with mutation testing; no lizard. CI runs it in `.github/workflows/python-e2e.yml` only for changes
  under `core/`, `shared/`, `languages/python/`, `languages/java/ingest/`, `languages/java/adapters/`
  or the package files, with every tool version pinned in `.github/python-e2e-constraints.txt`
  (also given to the suite's own `uv pip install` calls as `UV_CONSTRAINT`). On `languages/python/adapters/fixtures/python-project` (one legacy ruff violation on the
  base, editable install in a `.venv`) it checks: a change that alters behaviour and updates its
  tests passes, which only works when base tests run against base code; a moved legacy violation
  stays baselined; a new unused import and an unformatted file fail in every report format;
  failing tests are a tool error with exit 1 and a missing environment one with exit 2; a `unittest` project
  formatted with black passes and fails correctly using tools from the `PATH`; a `uv.lock` project
  runs through `uv run`; and a pytest project whose `addopts` has `--cov`, `-n 2` and `--lf`,
  with a legacy Python 2 file, which stays gated (the file is skipped by black, or excluded) and
  fails a change that deletes every test. For mutation testing: new survivors and uncovered mutants fail
  (and the legacy survivors of the fixture do not), a change whose mutants are all killed passes,
  a source-only change that adds a survivor is caught while reusing the base results, a change to a
  callee is caught in its unchanged caller (not reused), and a project with xdist in its `addopts`
  and an excluded Python 2 file mutates with the `[tool.mutmut]` that nitpicker adds. The
  `unittest` project mutates with a `[tool.mutmut]` that nitpicker adds, and the xdist project with
  its own `[tool.mutmut]` runs without a `-n 0` workaround. A change that adds a test sleeping past
  a lowered `unitTestSeconds` and two tests that log a warning or print to standard error fails
  `slow-test`, `sleep-in-test` and `test-console-output`, and passes once `python.exceptions`,
  `testConsole.allow` and top-level exceptions lift them.
- Slice 2: `languages/python/rules/rule-hint-tests/rule-hints.test.mjs` (always on) checks that every rule has a
  banned and an allowed fixture directory and that its message names the allowed form and the
  exception route; `type-check.test.mjs`, `rules-report.test.mjs`, `python-types.test.mjs`,
  `python-ast-rules.test.mjs` and `python-exceptions.test.mjs` cover the ingesters, the two new
  steps and the exception filter with the fake toolchain.
- `languages/python/rules/rule-cases.e2e.test.mjs`, `nitpicker-rules.e2e.test.mjs` and
  `rules/e2e/<group>/*.e2e.test.mjs` (`boundary`, `environment`, `honesty` and `smells`, each case a code
  snippet and the findings it must produce): gated behind `NITPICKER_PYTHON_E2E=1` too. The first runs the banned and the allowed fixture of every rule
  (`languages/python/rules/fixtures/<case>/{banned,allowed}`) through the real ruff, python3, mypy,
  pyright and basedpyright from the `PATH`; the second drives `nitpicker_rules.py` over edge cases (test files,
  nested classes, comment forms), and `swallowing.e2e.test.mjs` does the same for `swallowed-exception` and `blind-suppress`. The preset e2e test also gates type errors with mypy and pyright,
  the one-way rules and `exceptions` end to end; `languages/python/adapters/e2e/` holds the
  basedpyright e2e (a configured and a weakened `[tool.basedpyright]` table) and the `if TYPE_CHECKING:`
  one (no stability inversion, import-linter still sees it), which share `helpers.mjs` with the preset e2e.
- `languages/python/ruff/ruff-rules.e2e.test.mjs` and `ruff-groups.e2e.test.mjs`: gated behind
  `NITPICKER_PYTHON_E2E=1` and part of `npm run test:python` (the ruff from the `PATH`, or
  `NITPICKER_RUFF`). Every stable `RUF` rule, and every stable rule of the listed groups, of the
  installed ruff must be selected or ignored in `nitpicker-ruff.toml`, so a new stable rule fails the
  test until someone reviews it. `adapters/configuration/python-ruff-config.e2e.test.mjs` (the
  generated ruff config keeps the group selectors and the rules the installed ruff knows) and
  `adapters/formatting/format-scope.e2e.test.mjs` (the formatters run isolated from the project
  config) run in the same suite.
- `core/pack-contents.test.mjs` checks that the Python files, including the ruff config and the
  rules script, are in the npm package.
- Slice 5 unit tests: `python-sources.test.mjs` (module naming, exclusions), `python-coupling.test.mjs`
  (import resolution, packages, stability direction, type-only edges, the scan step with a fake
  interpreter), `e2e/import-scan.e2e.test.mjs` (the real scan script over the `if TYPE_CHECKING:` forms, and files with a 1100-branch `elif` chain or a 2500-term expression, which the iterative scan still reads),
  `python-duplicates.test.mjs` (real jscpd on small projects), `python-import-linter.test.mjs`
  (config detection, the run, failures), `ingest/import-linter.test.mjs` (real import-linter 2.15
  output in `ingest/fixtures`), `shared/rules/coupling-report.test.mjs`, and CLI cases in
  `core/command/python/python-cli-*.test.mjs` using the fake `lint-imports` and an `import-scan.json` the fake
  interpreter prints. The e2e file has a layered `shop` project (a copy fails as a duplicate; a
  domain package importing the web package fails as `stability-direction` and as two broken
  import-linter chains; `importLinter: false` skips the contracts; a clean change passes) and needs
  `import-linter` from PyPI.
- `core/pack-contents.test.mjs` checks that the Python files, including the ruff config and the
  import scan, are in the npm package.
