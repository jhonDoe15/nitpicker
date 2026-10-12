# Python preset

Status: slice 1 (ticket PY1) and slice 6 (ticket PY6, mutation testing) implemented; the other slices
are planned below. The scope is a proposal
pending owner review.

The Python preset runs the same differential gate as the TypeScript and Java presets on a Python
project: run the tools on the merge base and on head, turn each report into findings
([`spec/findings.schema.json`](../spec/findings.schema.json)), and fail only on new enforceable
findings. The comparison is the language-neutral core (`compareFindings`, rename map from git),
which the conformance suite in [`spec/conformance`](../spec/conformance/README.md) covers. The
Python side contributes only two things: producing reports inside the project's own environment,
and converting them into findings.

The purpose is the same as everywhere else: narrow a flexible language to roughly one allowed way
of doing each thing. That "one way" lives in the code and architecture rules (slices 2 to 5), not in
which tools a project uses, so the preset detects the tools a project already has (uv, poetry or a
plain virtualenv; ruff or black; pytest or unittest) and never makes adoption depend on switching.

## How it works

```
node languages/python/adapters/python-runner.mjs   (one process per snapshot: base, head)
  -> ruff check  --config nitpicker-ruff.toml      -> ruff.sarif
  -> ruff format --check --diff | black --check    -> format.txt
  -> coverage run --branch -m pytest | unittest    -> coverage.json  (coverage.py JSON report)
  -> mutmut run (after the tests passed)           -> mutation.json  (read from mutmut's mutants/)
  -> readPythonFindings                             (languages/python/adapters/python-reports.mjs)
  -> compareFindings(base, head, renames)           (core)
```

Reports are written to a temporary directory outside the project and removed afterwards, so
nothing is added to the analyzed tree (no caches, no `.coverage` file, no bytecode). That
directory is the contract between the tool runs and the readers; later slices add files to it.

- **Selection.** Explicit only: `"preset": "python"` in `nitpicker.config.json`. There is no
  auto-detection of `pyproject.toml`. `nitpicker` finds the project from the nearest directory with
  a `package.json` or a `nitpicker.config.json`, so a Python project needs no `package.json`.
- **One analyzer, several tools.** A single analyzer, `python`, whose findings carry the tool names
  `ruff`, `ruff-format` or `black`, and `coverage`. The version is the versions of the tools in the
  project's environment (`ruff@0.9.9;coverage@7.6.1;pytest@8.3.1`), read from the live checkout, and
  the configuration hash covers the Python adapter files, the nitpicker-owned ruff config and the
  `python` settings. Upgrading ruff, or editing the preset, therefore invalidates the base cache.
- **Ingesters.** Nothing generic was moved. The Java ingesters are reused where they already are:
  `languages/java/ingest/sarif.mjs` (ruff), `format-check.mjs` (the format check) and `common.mjs`.
  The one new ingester is `languages/python/ingest/coverage-json.mjs` for the coverage.py JSON
  report. The legacy-inventory and `exclude` handling is Java's `applyJavaPolicy` /
  `configureJavaAnalyzer`, which are language-neutral and take the tool name for a
  `baseline-expansion` finding as an option.

## The project's own environment

The tools run inside the environment the project already has, detected in this order (the first
that applies wins):

| Order | Detected by                 | The tools run as                                                                                             |
| ----- | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 0     | `python.environment` is set | `uv`, `poetry` or `path` as named; any other value is a virtualenv directory, inside the project or absolute |
| 1     | `uv.lock`                   | `uv run --project <checkout> --no-sync -- <tool>`; needs `uv sync` to have run (or `UV_PROJECT_ENVIRONMENT`) |
| 2     | `poetry.lock`               | the virtualenv `poetry env info --path` reports, first on `PATH`; needs `poetry install` to have run         |
| 3     | a uv workspace root above   | as 1: an ancestor with a `uv.lock` and a `[tool.uv.workspace]` table; its `.venv` is the environment         |
| 4     | a `.venv/` directory        | `.venv/bin` first on `PATH`, `VIRTUAL_ENV` set                                                               |
| 5     | nothing                     | `ruff`, `black`, `coverage` and `python3` from the `PATH`                                                    |

The environment is always the one of the live checkout (the head work tree you run `nitpicker` in).
It is never created or synced by nitpicker: the uv environment is checked before `uv run --no-sync`
is called, so a missing `.venv` is an error and not an empty environment created in your checkout.
A virtualenv outside the project (a shared `/opt/venv`, an activated CI environment) is used with
an absolute `python.environment`. A tool that is
not installed in the environment but is on the `PATH` (typically `ruff`, which many projects use
from `pipx` or `uvx`) is used from the `PATH`. `coverage` and `pytest` must be in the environment,
since pytest imports the project's code and dependencies; the error says so.

### The base snapshot has no environment of its own

The base side is a separate git work tree of the merge base, and it has no virtualenv. Running the
live checkout's environment there would normally import the wrong code: the project is usually
installed into the environment in editable mode, which points at the live checkout, so the base
tests would silently exercise head code (and fail, or worse, pass for the wrong reason).

Decision: **prepend the snapshot's own import roots to `PYTHONPATH`** for every tool run, the same
way for base and head. The import root of a source root is the directory itself for a `src/`
layout, and its parent for a flat package. `PYTHONPATH` entries come before `site-packages` and
before the `.pth` files and import hooks editable installs use, so the snapshot's sources win.
Tests run with the snapshot as working directory, so `tests/` and `conftest.py` are the snapshot's
too, and coverage only measures the snapshot's source roots.

Why not the dependency hook (`languages/typescript/adapters/dependency-hooks.mjs`)? A hook installs
a directory into the snapshot (`npm ci` for `node_modules`) and removes it afterwards. For Python
that means building a second environment per snapshot: minutes of work, network access, and the
base would be analyzed with the base's pinned tool versions while head uses head's, so every
upgrade of ruff would show up as new findings. One environment for both sides keeps the tool
versions identical, which is what a differential gate needs. The cost is that base is analyzed
with head's dependencies; a change that needs a new dependency to even import its base sources is
rare, and the CI job that runs the gate has the head environment installed anyway.

Limits: compiled extension modules of the project itself that are built into the environment are
not rebuilt for base; and a project whose code does not live under the detected source roots must
set `python.sourceRoots`.

## Configuration

Config keys with this preset: `base`, `disable`, `analyzers`, the keys shared by all languages,
`thresholds` (`crapLimit`, enforced from slice 3), `exclude` (findings under the globs are
dropped) and `legacyInventory` (same format and `baseline-expansion` rule as for Java), and the
`python` object below. `layout` and `exceptions` describe TypeScript source roots and ESLint rules,
have no Python meaning, and stay a config error with this preset. `python` is an error with any
other preset.

```json
{
  "preset": "python",
  "python": {
    "environment": "uv",
    "formatter": "black",
    "testRunner": "pytest",
    "sourceRoots": ["src"]
  }
}
```

| Key           | Values                                 | Default                                                                              |
| ------------- | -------------------------------------- | ------------------------------------------------------------------------------------ |
| `environment` | `uv`, `poetry`, `path`, or a directory | detected, see above                                                                  |
| `formatter`   | `ruff`, `black`                        | `black` if the project declares it (see below) and not ruff's formatter, else `ruff` |
| `testRunner`  | `pytest`, `unittest`                   | `pytest` if the project uses it (see below), else `unittest`                         |
| `sourceRoots` | non-empty array of project directories | `src`, else the top-level packages (directories with `__init__.py`), else `.`        |

Exceptions: there is no inline disable (`# noqa` is not honored, `--ignore-noqa`), and the
TypeScript `exceptions` key does not exist here. A path that legitimately breaks a rule is lifted
with `exclude` in `nitpicker.config.json` (it drops every finding under the globs, and the paths
are not handed to ruff or black either); existing violations are baselined with the legacy
inventory, where `source` is the finding's `identity` as printed in `new-findings.json`
(`fp:nitpicker/subject=<ruff message>` for ruff). The rules most likely to flag code that is right
for its place are `T201` (`print` in a command-line tool or a notebook), `PERF203` (`try` in a
loop that must handle each item) and `F401` (an `__init__.py` that re-exports): `exclude` the
path, for example `"exclude": ["src/demo/cli.py", "**/__init__.py"]`. The project's own ruff
configuration (`[tool.ruff]`, `ruff.toml`) and `[tool.coverage]` are not read for linting and
coverage, so the result means the same on every project; there is no override key for them.

The formatter is `black` when `pyproject.toml`, `setup.cfg`, `tox.ini`, `Pipfile`,
`.pre-commit-config.yaml` or a requirements file (`requirements*.txt`, `requirements/*.txt`) has a
`[tool.black]` table, `black` as a dependency (a requirements line, a poetry key or an entry of any
TOML dependency array), a `tox` command, or the `psf/black` or `black-pre-commit-mirror` repository
or the `black` hook id, and none of them configures ruff's formatter (`[tool.ruff.format]`, a
`[format]` table in `ruff.toml`, the `ruff-format` hook). The format check uses the project's own
formatter configuration (line length and so on); only the lint rules are nitpicker's. A format
finding from a detected formatter says so and names `python.formatter`, the setting that changes
it.

The test runner is `pytest` when the project shows it uses it: a `[tool.pytest.ini_options]`,
`[pytest]` or `[tool:pytest]` section, `pytest.ini`, `pytest` or a pytest plugin as a dependency or
tox command, a `conftest.py`, or test files with top-level `def test_` functions, `import pytest`
or `Test` classes without a base. It is decided from the project, not from what the environment
can import, so an environment without pytest is an error (`environment-failed`, naming
`python.testRunner`) and not a silent run of `unittest` that finds none of the tests.

## Slice 1: tools, reports and identities

- **Lint: ruff.** `ruff check --config languages/python/ruff/nitpicker-ruff.toml --ignore-noqa
--no-cache --output-format sarif`. The rule set is nitpicker's, not the project's, so the gate
  means the same on every project: pyflakes (`F`), the error rules of pycodestyle that are not
  formatting (`E4`, `E7`, `E9`), bugbear (`B`), comprehensions (`C4`), `SIM`, `PIE`, `RET`, `PERF`,
  `RUF` and `T20` (no `print`), without `B008` (a call in an argument default, which the web
  frameworks need) and `RUF001`, `RUF002`, `RUF003` and `RUF012` (non-ASCII text and mutable class
  attributes, both common in correct code). The target version follows the project's
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
directory>` or `-m unittest discover` (with `-s tests` or `-s test` when that directory exists,
  and `-t .` when it is a package), then `coverage json`. The project's pytest configuration keeps
  working: `--no-cov` and `-n0` are added only when pytest-cov or xdist is installed, so
  `--cov=pkg` or `-n 2` in `addopts` cannot replace the outer coverage run or fork it away, and
  `--lf` or `--sw` find their cache in the report directory. The coverage settings are nitpicker's,
  written to the report directory: branch coverage on, `parallel` off, `source` the source roots
  that exist in the snapshot. The project's `.coveragerc` is not used, so a project that measures
  subprocesses or uses a coverage plugin needs more than this slice. `# pragma: no cover` keeps
  its coverage.py meaning for now. Exit status 5 (no tests collected) is accepted; any other
  non-zero status is a tool error. A snapshot where no test ran has an enforceable
  `python/no-tests-ran` finding: it is new, and so fails, only when the change removed the last
  tests, and a project that has none on both sides is unaffected. coverage.py 7.6 or newer is
  needed for the per-function data.
- **Coverage findings.** The JSON report is ingested by `languages/python/ingest/coverage-json.mjs`:
  `line-coverage` per file (a metric, as for JaCoCo and lcov) and `uncovered-function` for each
  function none of whose statements ran. Both are descriptive in this slice; PY3 and PY4 turn the
  same report into CRAP and changed-branch coverage. The JSON also carries the per-line branch data
  (`executed_branches`, `missing_branches`) those slices need, which is why it was chosen over lcov.
  Paths are made project-relative.
- **Tool failures.** Anything that goes wrong on either snapshot becomes a `tool-error` finding with
  tool `python` and path `.`, never a throw from the CLI: `ruff-failed`, `format-failed`, `tests-failed` (the project's own
  tests fail, the same rule the TypeScript preset uses), `coverage-failed`, `mutation-failed`
  (slice 6), `environment-failed`
  and `python-failed` for anything unexpected. An environment that cannot be found at all (no
  `.venv` at the configured directory, no `uv sync`, poetry has none) is caught earlier, while the
  tool versions are read, and is reported as a plain `python` tool error for each snapshot. Every failing step is reported, with the end of the tool output. The CLI
  exits 2 when nothing new failed, and a snapshot with a tool error is not compared, as for Java.
- **Not included.** Type checking, the architecture rules, structure limits, CRAP, changed-branch
  coverage, duplicates and coupling are the next slices. Multi-project
  repositories are analyzed one project root at a time. Windows is untested (mutation testing
  needs WSL, see slice 6).

## Slice 6: mutation testing

Mutation testing follows [mutation-testing.md](mutation-testing.md) and the shared mutation rule
(`shared/rules/mutation.mjs`, the one the Java preset's PIT ingester feeds too): no score gate, a
new `Survived` mutant fails as `mutant-survived`, a new `NoCoverage` mutant fails as
`mutant-nocoverage`, and every other status (`Timeout`, `RuntimeError`, `CompileError`, `Ignored`)
is a descriptive finding that never fails. A mutant is identified by its function (`Class.method`),
the original and the mutated text and its occurrence among identical mutants of that status in the
function, never by a line number, so edits above a survivor keep it baselined. The line is only the
location.

- **Tool: mutmut 3**, in the project's environment like the other tools. It has to be installed
  there (a dev dependency); a missing mutmut is a `mutation-failed` tool error that says so. The
  version in the cache key is read from the package metadata (`mutmut --version` fails in a
  project where mutmut cannot guess its source directory).
- **What runs.** `mutmut run` in the snapshot after the other steps, and only when the tests
  passed (a failing test run is already `tests-failed`, and mutmut starts with a clean run of the
  same tests). The snapshot is a disposable work tree; mutmut writes its `mutants/` directory into
  it. On head the directory is removed afterwards. On base it stays, because head reads its
  results (see below), and it is the one place where the preset writes into the analyzed tree.
  Keep `mutants/` out of version control in your project, like `.venv/`.
- **Configuration.** mutmut reads `[tool.mutmut]` in `pyproject.toml` (or `[mutmut]` in
  `setup.cfg`). If the project has one, it is used as it is: `source_paths`, `also_copy`,
  `pytest_add_cli_args` and the rest stay the project's decision. If it has none, nitpicker adds
  one to the snapshot's `pyproject.toml` (never to your checkout): `source_paths` is the source
  roots and `do_not_mutate` skips the test files (`tests/`, `test_*.py`, `*_test.py`,
  `conftest.py`). Source roots of `.` are an error in that case, since mutmut would copy the whole
  project: set `python.sourceRoots` or `[tool.mutmut]`.
- **pytest.** mutmut 3 runs the suite with pytest, which also runs `unittest.TestCase` classes. A
  project whose runner is `unittest` therefore needs pytest installed for mutation testing; set
  `"testRunner": "unittest"` if you want coverage.py to keep running `unittest discover`.
- **Windows.** mutmut forks processes (`os.fork`), so it does not run on native Windows: run
  nitpicker inside WSL. On Windows the step fails with `mutation-failed` and says so.
- **A run with nothing covered.** When no test reaches any mutant mutmut stops with exit status 1
  and "could not find any test case for any mutant", leaving every result unchecked. That is not a
  tool error: every mutant is reported as `NoCoverage` (and a project with nothing to mutate
  reports nothing).

### Why mutmut, and how its results are read

mutmut 3 has no report file: `mutmut results` prints text for humans, `export-cicd-stats` only
counts, and the results live in `mutants/`. What was observed on mutmut 3.8.0 (and, reading the
sources of 3.2 to 3.5, on older releases):

- `mutants/<source file>.meta` is JSON with `exit_code_by_key` (`module.x_function__mutmut_N` to
  the exit status of the test run: 0 survived, 1 or 3 killed, 33 or 5 no tests, 36 and a few more
  timeout, 37 caught by the type checker, `null` not checked). That key is in every 3.x release
  checked; the other keys of the file change from one minor release to the next, so they are not
  read.
- `mutants/<source file>` is the generated code: `x_function__mutmut_orig` and one
  `x_function__mutmut_N` per mutant, whole functions. Diffing the two on tokens gives the original
  and mutated text, and finding the original function in the real file gives the line. mutmut does
  not record the mutation operator, so the text change stands in for it (the message only says
  whether a number, a string, an operator or an expression changed). The numbers `N` shift when a
  mutant is added above, which is why they are not part of the identity.
- A step in `python-mutation-data.mjs` reads those files into `mutation.json` in the report
  directory, the way the other tools write a report there, and `languages/python/ingest/mutmut.mjs`
  turns it into findings. A `.meta` file without `exit_code_by_key` is a tool error that says which
  mutmut is supported, not a silent pass.

cosmic-ray was the alternative. Its `dump` command is a proper machine-readable report with the
operator name, occurrence and position, and it runs on Windows. It was tried on the same small
project (99 mutants, 80 s against 3 s for mutmut's 34): it runs the whole test command for every
mutant, with no per-function test selection, so it is more than an order of magnitude slower; it
has no "no coverage" status (an untested function only shows as survived); and it rewrites the
source files in place while it runs. mutmut's function-level test selection and `NoCoverage` map
directly onto the shared rule, and the run data was stable enough to read, so mutmut it is. If a
future mutmut release changes the layout, the failure is loud and the fix is local to
`python-mutation-data.mjs`.

### Reusing base results on head

As the TypeScript preset does with Stryker's incremental file, head starts from the base run's
results when that is safe: the `mutants/*.meta` files of the base work tree are copied into the
head work tree before `mutmut run`, and mutmut re-tests the mutants of the functions whose code
changed and the ones it has no result for. This happens when every file changed between the base
commit and head is an added or modified `.py` file under a source root that is not a test
(`tests/`, `test/`, `test_*.py`, `*_test.py`, `conftest.py`). Anything else (a test, a dependency
file, a deleted or renamed file, a file outside the project) runs every mutant. When the base side
comes from the findings cache, there are no base results to copy and head runs every mutant.

Two things about mutmut shaped this. Its own cache is not trusted as a whole: carrying over the
`mutants/` directory of another checkout keeps its `mutmut-stats.json` (which tests cover which
function), and after adding a function that file makes the new function look untested, a false
`NoCoverage` (reproduced on 3.8.0). So only the per-mutant results are copied and mutmut collects
the statistics again, which is one run of the suite. And changed tests are not handled: a survivor
stays "survived" after a test that kills it was added, and a killed mutant stays "killed" after a
test was weakened, so a test change cannot reuse anything. Stryker re-tests the mutants covered by
a changed test; mutmut has no such step yet, hence source-only.

## Slices

Each slice is one PR, adds one concern, and changes the Python adapters, ingesters or rules, tests,
and this document. Slice 1 also made the config validation, the preset wiring in `core/` and the
exclude and legacy-inventory policy (`applyJavaPolicy`) serve more than one language.

| #   | Ticket                                                    | Slice                        | Tool and report                                                      | Findings                                                                                         | Status  |
| --- | --------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------- |
| PY1 | [#168](https://github.com/jhonDoe15/nitpicker/issues/168) | Base runner and CLI          | ruff, ruff format or black, pytest or unittest under coverage.py     | lint and format findings, `line-coverage`, `uncovered-function`, `tool-error`                    | this PR |
| PY2 | [#169](https://github.com/jhonDoe15/nitpicker/issues/169) | Type checking, one-way rules | mypy or pyright; ruff rules and import rules for the one allowed way | type errors; one-way rules with their failure messages; the Python skill                         | planned |
| PY3 | [#170](https://github.com/jhonDoe15/nitpicker/issues/170) | Structure limits and CRAP    | function metrics (lizard or ast) joined with the coverage report     | `function-*-limit` rules as for TypeScript and Java; `crap-score-limit`, `crap-coverage-unknown` | planned |
| PY4 | [#171](https://github.com/jhonDoe15/nitpicker/issues/171) | Changed-branch coverage      | the coverage JSON branch data and the changed lines from git         | `changed-branch-coverage`                                                                        | planned |
| PY5 | [#172](https://github.com/jhonDoe15/nitpicker/issues/172) | Duplicates and coupling      | jscpd with the `python` format; import graph for stability           | `duplicate-clone`, `duplicate-clone-size`; `stability-direction`                                 | planned |
| PY6 | [#173](https://github.com/jhonDoe15/nitpicker/issues/173) | Mutation testing             | mutmut 3 run data, per docs/mutation-testing                         | `mutant-survived`, `mutant-nocoverage` (new surviving mutants fail)                              | this PR |

Slice order follows what each one needs: PY2 to PY6 all reuse PY1's environment detection and
snapshot handling, PY3 and PY4 reuse its coverage report, and PY6 is last because it is the
slowest and needs the tests to pass reliably under the environment PY1 established. The custom
rules each slice adds are listed in [`spec/checks.md`](../spec/checks.md) (generated from
`shared/policy.mjs`) when they become enforced for Python; PY1 adds none.

## Tests

- `core/python-cli.test.mjs`: fast, always on. The CLI end to end with a fake toolchain
  (`languages/python/adapters/fixtures/fake-python-tools.mjs` behind wrapper scripts in a
  `.venv/bin`): clean and failing changes in every report format, a change that removes every test,
  tool errors (failing tests, no environment), `--all`, rejected TypeScript-only keys, and that
  base and head each run with their own sources on `PYTHONPATH`. One test per behaviour that no
  unit test below covers.
- Unit tests next to the code: environment (including uv, poetry and workspace launchers), formatter,
  test runner, target version and source root detection, the tool steps (arguments, long output,
  missing tools, unparsable files), the runner (exclude, legacy inventory, messages) and its
  arguments, the analyzer and its configuration files, config validation and the coverage ingester
  (on a real coverage.py report).
  The mutmut ingester runs on the recorded run data of a real mutmut 3.8 run
  (`languages/python/ingest/fixtures/mutmut-run.json`); the reuse check runs against real work trees
  of a repository; the fake `mutmut` writes a `mutants/` directory from a `mutants-data.json` in the
  project and logs which result files it found there.
- `languages/python/adapters/python-preset.e2e.test.mjs`: gated behind `NITPICKER_PYTHON_E2E=1`
  (`npm run test:python`). Needs python3, uv, ruff, black and network access to PyPI; about 2
  minutes. On `languages/python/adapters/fixtures/python-project` (one legacy ruff violation on the
  base, editable install in a `.venv`) it checks: a change that alters behaviour and updates its
  tests passes, which only works when base tests run against base code; a moved legacy violation
  stays baselined; a new unused import and an unformatted file fail in every report format;
  failing tests and a missing environment are tool errors with exit 2; a `unittest` project
  formatted with black passes and fails correctly using tools from the `PATH`; a `uv.lock` project
  runs through `uv run`; and a pytest project whose `addopts` has `--cov`, `-n 2` and `--lf`,
  with a legacy Python 2 file, which stays gated (the file is skipped by black, or excluded) and
  fails a change that deletes every test. For mutation testing: new survivors and uncovered mutants fail
  (and the legacy survivors of the fixture do not), a change whose mutants are all killed passes,
  a source-only change that adds a survivor is caught while reusing the base results, and the
  flat-layout `unittest` project mutates with a `[tool.mutmut]` that nitpicker adds.
- `core/pack-contents.test.mjs` checks that the Python files, including the ruff config, are in
  the npm package.
