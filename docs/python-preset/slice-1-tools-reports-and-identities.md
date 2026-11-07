# Slice 1: tools, reports and identities

Part of the [Python preset guide](../python-preset.md).

- **Lint: ruff.** `ruff check --config <report dir>/nitpicker-ruff.toml --line-length <python.lineLength>
--ignore-noqa --no-cache --output-format sarif`, where the toml is `languages/python/ruff/nitpicker-ruff.toml`
  without the codes the installed ruff lacks (`ruffConfigFor`). The rule set is nitpicker's, not
  the project's, so the gate means the same on every project: pyflakes (`F`), the error rules of
  pycodestyle that are not formatting (`E4`, `E7`, `E9`), bugbear (`B`), comprehensions (`C4`),
  `SIM`, `PIE`, `RET`, `PERF`, a list of the stable `RUF` rules (without `RUF001`, `RUF002`,
  `RUF003` and `RUF012`: non-ASCII text and mutable class attributes, both common in correct
  code) and `T20` (no `print`), without `B008` (a call in an argument default, which the web
  frameworks need). Slice 2 adds the shared one-way groups `G`, `N`, `ERA`, `ARG`, `PT`, `S`, `TRY`,
  `PLR2004` and `DTZ`. The target version follows the project's
  `requires-python` (or poetry's `python`, or `python_requires`): its lowest version, never lower
  than 3.8, and 3.8 when none is declared, so a rule that exists only on newer versions (`B905`,
  `zip(strict=)`) cannot flag code that must run on an older one. The SARIF goes through the existing generic ingester; identity is the
  rule plus the message text (which names the symbol), never a line, so edits above a finding keep
  it baselined. All findings are enforceable.
- **Format check.** `ruff format --check --diff` or `black --check`, one `ruff-format/format` or
  `black/format` finding per file that would change, identity `format`, like the other
  format checks. The files are read from the `--- path`/`+++ path` diff headers (ruff) or the
  `would reformat` lines (black), because ruff's own summary format changes between versions. A
  formatter that exits 1 without naming a file is a tool error, not a pass. Files matching
  `exclude` are not given to the formatter, and a file it cannot parse (a legacy Python 2 file) is
  skipped, because ruff already reports it as an `invalid-syntax` finding; any other formatter
  failure is a tool error.
- **Tests under coverage.** `coverage run --rcfile <nitpicker> -m pytest -q -o cache_dir=<report
directory>` or `test-runs/unittest_timings.py <report> discover` (unittest's own `discover`, with
  `-s tests` or `-s test` when that directory exists, else `-s testing` when a top-level `testing`
  folder holds a `test*.py` file (a folder of only helpers is not a start directory), and `-t .`
  when it is a package, through a
  `TextTestRunner` whose result records each test's time and writes the JUnit report),
  `manage.py test --noinput` (the project's own settings, from `manage.py`, run from the directory
  `manage.py` is in) or `-m nose2`, then `coverage json`. The project's pytest configuration keeps
  working: `--no-cov` and `-n0` are added only when pytest-cov or xdist is installed, so
  `--cov=pkg` or `-n 2` in `addopts` cannot replace the outer coverage run or fork it away, and
  `--lf` or `--sw` find their cache in the report directory. The coverage settings are nitpicker's,
  written to the report directory: branch coverage on, `parallel` off, `source` the source roots
  that exist in the snapshot, test files left out of measurement (`test_*.py`, `*_test.py`,
  `tests.py`, `conftest.py`, `*/tests/*`, `*/test/*`, and `testing/*` at the project root), and a fixed `exclude_lines` of the idioms that
  cannot be tested (see Exceptions under slice 4). From the project's own coverage configuration
  (the first of `.coveragerc`, `setup.cfg` `[coverage:run]`, `tox.ini` `[coverage:run]` and
  `[tool.coverage.run]` that has coverage settings, the order coverage.py reads them in) the run
  settings that decide what code gets measured at all are kept: `concurrency` (multiprocessing,
  gevent, eventlet, ...), `patch` (subprocesses) and `plugins`. Lists may run over several lines with
  comments and blank lines in between, as coverage.py reads them; the `source` paths and, with the
  opt-in, relative `omit` patterns are made absolute, so they match whatever directory the tests run
  from.
  When they make coverage.py write one data file per process, the files are combined before the
  report. Its `exclude_lines`, `exclude_also`, `partial_branches`, `branch` and `source` are
  dropped, so the gate judges every project's code the same way, until
  `"tools": { "coverage": { "precedence": ["project", "nitpicker"] } }` opts the config in: then its
  `exclude_lines`, `exclude_also`, `partial_branches` and `partial_also` are added to nitpicker's
  (a project that lists `pragma: no cover` gets its pragma back), the `omit` of its run and report
  sections (where projects often list `migrations/*`) is added to the test files, and its `timid`,
  `cover_pylib`, `dynamic_context`, `sigterm`, `disable_warnings` and `core` apply, each checked to
  be a value coverage.py takes; `branch`, `parallel`,
  `source`, `include`, `data_file`, `[paths]` and the report settings stay nitpicker's.
  `["nitpicker", "project"]` takes only those run options and keeps nitpicker's exclusions and
  omits. The
  opted-in config is read from the head checkout for both sides, and an edit of its coverage
  settings is a policy change a person reviews. Test files are not scored for
  CRAP either, and a source file the project omits has unknown coverage
  (`crap-coverage-unknown`). Exit status 5 (no tests collected) is accepted; any other
  non-zero status is a tool error. A snapshot where no test ran has an enforceable
  `python/no-tests-ran` finding: it is new, and so fails, only when the change removed the last
  tests, and a project that has none on both sides is unaffected. coverage.py 7.6 or newer is
  needed for the per-function data.
- **Coverage findings.** The JSON report is ingested by `languages/python/ingest/coverage-reports/coverage-json.mjs`:
  `line-coverage` per file (a metric, as for JaCoCo and lcov) and `uncovered-function` for each
  function none of whose statements ran. Both are descriptive; PY3 turns the same report into CRAP
  and PY4 into changed-branch coverage (slice 4 below). The JSON also carries the per-line branch data
  (`executed_branches`, `missing_branches`) those slices need, which is why it was chosen over lcov.
  Paths are made project-relative.
- **Tool failures.** Anything that goes wrong on either snapshot becomes a `tool-error` finding with
  the analyzer as tool (`python`, or `mutation` for `mutation-failed`) and path `.`, never a throw from the CLI: `ruff-failed`, `format-failed`, `tests-failed` (failing tests the
  runner names, the `tests/tests-failed` error of [Runner parity](runner-parity.md), which keeps the other
  findings; on the base alone it is a note, see [A base whose tests fail](../usage.md#a-base-whose-tests-fail)),
  `tests-not-run` (a test run that exits 1 without naming a failing test, or whose failures are all
  collection or load errors, or exits with any other status; it stops the analyzer, also on the base), `coverage-failed`, `types-failed` and `rules-failed` (slice 2), `structure-failed`, `environment-failed`,
  `duplicates-failed`, `coupling-failed`, `import-linter-failed` (slice 5), `mutation-failed` (slice 6)
  and `python-failed` for anything unexpected. An environment that cannot be found at all (no
  `.venv` at the configured directory, no `uv sync`, poetry has none) is caught earlier, while the
  tool versions are read, and is reported as a plain tool error of each analyzer for each snapshot. Every failing step is reported, with the end of the tool output. The CLI
  exits 2 when nothing new failed and no head test failed (failing head tests exit 1), and a snapshot with a tool error is not compared, as for Java; the other analyzer is.
- **Not included.** Multi-project
  repositories are analyzed one project root at a time. Windows is untested (mutation testing
  needs WSL, see slice 6).
