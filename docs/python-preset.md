# Python preset

Status: slice 1 (ticket PY1) and slice 3 (ticket PY3, structure limits and CRAP) implemented; the other slices are planned below. The scope is a proposal
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
  -> python structure_metrics.py                    -> structure.json  (slice 3)
  -> lizard --csv -l python                         -> lizard.csv      (slice 3)
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
| 0     | `python.environment` is set | `uv`, `poetry` or `path` as named; any other value is a virtualenv directory inside the project              |
| 1     | `uv.lock`                   | `uv run --project <checkout> --no-sync -- <tool>`; needs `uv sync` to have run (or `UV_PROJECT_ENVIRONMENT`) |
| 2     | `poetry.lock`               | the virtualenv `poetry env info --path` reports, first on `PATH`; needs `poetry install` to have run         |
| 3     | a `.venv/` directory        | `.venv/bin` first on `PATH`, `VIRTUAL_ENV` set                                                               |
| 4     | nothing                     | `ruff`, `black`, `coverage` and `python3` from the `PATH`                                                    |

The environment is always the one of the live checkout (the head work tree you run `nitpicker` in).
It is never created or synced by nitpicker, and `uv run --no-sync` never touches it. A tool that is
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
`thresholds` (`crapLimit`, enforced since slice 3), `exclude` (findings under the globs are
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
| `testRunner`  | `pytest`, `unittest`                   | `pytest` if it can be imported in the environment, else `unittest`                   |
| `sourceRoots` | non-empty array of project directories | `src`, else the top-level packages (directories with `__init__.py`), else `.`        |

Exceptions: there is no inline disable (`# noqa` is not honored, `--ignore-noqa`), and the
TypeScript `exceptions` key does not exist here. A path that legitimately breaks a rule is lifted
with `exclude` in `nitpicker.config.json`; existing violations are baselined with the legacy
inventory, where `source` is the finding's `identity` as printed in `new-findings.json`
(`fp:nitpicker/subject=<ruff message>` for ruff).

The formatter is `black` when `pyproject.toml`, `requirements*.txt`, `setup.cfg`, `tox.ini` or
`.pre-commit-config.yaml` has a `[tool.black]` table, a dependency named `black`, or the
`psf/black` hook, and none of them configures ruff's formatter (`[tool.ruff.format]`, a `[format]`
table in `ruff.toml`, the `ruff-format` hook). The format check uses the project's own formatter
configuration (line length and so on); only the lint rules are nitpicker's.

## Slice 1: tools, reports and identities

- **Lint: ruff.** `ruff check --config languages/python/ruff/nitpicker-ruff.toml --ignore-noqa
--no-cache --output-format sarif`. The rule set is nitpicker's, not the project's, so the gate
  means the same on every project: pyflakes (`F`), the error rules of pycodestyle that are not
  formatting (`E4`, `E7`, `E9`), bugbear (`B`), comprehensions (`C4`), `SIM`, `PIE`, `RET`, `PERF`,
  `RUF` and `T20` (no `print`). Nothing is version-sensitive, so the result does not depend on the
  project's `requires-python`. The SARIF goes through the existing generic ingester; identity is the
  rule plus the message text (which names the symbol), never a line, so edits above a finding keep
  it baselined. All findings are enforceable.
- **Format check.** `ruff format --check --diff` or `black --check`, one `ruff-format/format` or
  `black/format` finding per file that would change, identity `format`, like the other
  format checks. The files are read from the `--- path`/`+++ path` diff headers (ruff) or the
  `would reformat` lines (black), because ruff's own summary format changes between versions. A
  formatter that exits 1 without naming a file is a tool error, not a pass.
- **Tests under coverage.** `coverage run --rcfile <nitpicker> -m pytest -q -p no:cacheprovider`
  or `-m unittest discover` (with `-s tests` or `-s test` when that directory exists), then
  `coverage json`. The coverage settings are nitpicker's, written to the report directory: branch
  coverage on, `parallel` off, `source` the source roots. The project's `.coveragerc` is not used,
  so a project that measures subprocesses or uses a coverage plugin needs more than this slice.
  `# pragma: no cover` keeps its coverage.py meaning for now. Exit status 5 (no tests collected) is
  accepted; any other non-zero status is a tool error. coverage.py 7.6 or newer is needed for the
  per-function data.
- **Coverage findings.** The JSON report is ingested by `languages/python/ingest/coverage-json.mjs`:
  `line-coverage` per file (a metric, as for JaCoCo and lcov) and `uncovered-function` for each
  function none of whose statements ran. Both are descriptive in this slice; PY3 and PY4 turn the
  same report into CRAP and changed-branch coverage. The JSON also carries the per-line branch data
  (`executed_branches`, `missing_branches`) those slices need, which is why it was chosen over lcov.
  Paths are made project-relative.
- **Tool failures.** Anything that goes wrong on either snapshot becomes a `tool-error` finding with
  tool `python` and path `.`, never a throw from the CLI: `ruff-failed`, `format-failed`, `tests-failed` (the project's own
  tests fail, the same rule the TypeScript preset uses), `coverage-failed`, `structure-failed`, `lizard-failed`, `environment-failed`
  and `python-failed` for anything unexpected. An environment that cannot be found at all (no
  `.venv` at the configured directory, no `uv sync`, poetry has none) is caught earlier, while the
  tool versions are read, and is reported as a plain `python` tool error for each snapshot. Every failing step is reported, with the end of the tool output. The CLI
  exits 2 when nothing new failed, and a snapshot with a tool error is not compared, as for Java.
- **Not included.** Type checking, the architecture rules, changed-branch coverage, duplicates,
  coupling and mutation testing are the next slices. Multi-project
  repositories are analyzed one project root at a time. Windows is untested.

## Slice 3: structure limits and CRAP

- **Rules.** The shared structure rule (`shared/rules/structure.mjs`) and CRAP rule
  (`shared/rules/crap.mjs`) run on Python with the TypeScript and Java ids, limits and messages:
  `function-lines-limit` (50), `function-statements-limit` (15), `function-control-nesting-limit`
  (2), `function-parameters-limit` (3), `crap-score-limit` (9, `thresholds.crapLimit` overrides it)
  and `crap-coverage-unknown`. `shared/policy.mjs` marks them enforced for Python and
  `spec/checks.md` is regenerated. A function that already breaks a limit on the base and is edited
  fails only when the change makes that metric worse, exactly as for the other languages (the
  `ratchet` field of the finding, handled by the core comparison); a new function over a limit, or
  one the change pushes over it, fails as usual. Exceptions are the usual ones: `exclude` in
  `nitpicker.config.json` for a path, or the legacy inventory; there is no inline disable.
- **Structure metrics (decision to review).** `languages/python/metrics/structure_metrics.py` parses
  the source files with the standard library `ast` module (parse only, nothing is imported or run)
  and writes one object per function to `structure.json`. It is run by the project's own Python
  (`python <script> <output> <project> <file list>`), so it needs no dependency and no pin, and it
  parses with the grammar of the interpreter the project uses; a file that does not parse is
  skipped (ruff's `E9` rules already report it). lizard has no statement count or control nesting,
  so all four metrics come from this one script, like `StructureMetrics.java` for Java.
- **Definitions** (the TypeScript analyzer's, applied to Python syntax). Unit: every `def` and
  `async def` with a body, methods and nested functions alike; named `Outer.method` and
  `outer.inner`, the qualified names coverage.py uses. `lines`: last line - first line + 1, from the
  first decorator and including the docstring (TypeScript counts comments the same way).
  `statements`: every statement in the body, compound statements counting once plus their bodies:
  `if`/`elif` (an `elif` is a nested `if` statement, as `else if` is in TypeScript), `for`, `while`,
  `try`, `with`, `match`, `return`, `pass`, assignments, a nested `def` or `class` (but not its
  body); not counted: the docstring, `else`/`finally` themselves, `except` clauses and `case`
  clauses (only their bodies). `maxControlNesting`: the deepest nesting of `if`/`elif`, `for`,
  `async for`, `while`, `match` and `except`; `try`, `with` and comprehensions do not nest. An
  `elif` chain nests one level per branch, like `else if` in TypeScript and Java, so an
  `if`/`elif`/`elif` chain is already three deep: use early returns or a lookup table.
  `parameters`: positional-only, positional, keyword-only, `*args` and `**kwargs`, one each; the
  `/` and `*` markers are not parameters. The first positional parameter of a method (`self`,
  `cls`, or whatever it is called) is not counted, because the caller does not pass it: a function
  directly in a class body that is not a `@staticmethod`. Lambdas and comprehensions are part of
  the function that contains them; nested functions and methods of nested classes are units of
  their own and do not count towards the function around them.
- **Which files.** The `.py` files under the source roots (see `sourceRoots`), skipping hidden
  directories, `__pycache__`, `node_modules` and `site-packages`. Node lists them once per
  snapshot (`python-files.txt`) and hands the same list to the metrics script and to lizard.
  Tests are outside the default source roots, so they are not gated.
- **Findings.** Same as Java: `languages/python/adapters/python-structure.mjs` gives the metrics to
  `evaluateStructure` and keeps the enforceable limit findings (tool `structure`; the descriptive
  per-function metrics are not emitted). Identity: qualified name, occurrence among equal names in
  the file, and a hash of the function text with the common indentation removed, so moving or
  re-indenting a whole function keeps it baselined while changing the nesting of a statement inside
  it counts as an edit (Java trims every line, which would hide that in Python).
- **CRAP.** lizard `--csv -l python -f <file list>` gives the cyclomatic complexity per function
  (the file list, not directories, because lizard silently skips files whose content is identical
  to another file when it walks a directory). It is pinned to the version in
  `languages/java/gradle/nitpicker.init.gradle` (1.24.1). Resolution, in order: the executable
  named by `NITPICKER_LIZARD` (only that one), `lizard` from the project environment or the `PATH`,
  `uvx lizard==<pin>`; a lizard that is missing or reports another version is the tool error
  `lizard-failed` with the install instruction (`pip install lizard==1.24.1`). It is not installed
  for the project.
- **Coverage join.** `languages/python/ingest/crap.mjs` takes the per-function entries of the
  coverage.py JSON report PY1 already produces (`files.<path>.functions`, coverage.py 7.6 or newer)
  and joins each lizard function to the entry with the same trailing name whose lines
  (`executed_lines`, `missing_lines`, `excluded_lines`) lie inside the lizard line range; lizard
  names carry no class (`m`, `m.inner`), coverage.py names do (`A.m`, `A.m.inner`), so the joined
  entry also gives the display name. `start_line` is not used, because only recent coverage.py
  versions report it. Coverage of a function is the lower of its line and branch percentage, as for
  JaCoCo, and CRAP is `ccn^2 * (1 - coverage)^3 + ccn`, shared with Java
  (`ingestCrapRows` in `languages/java/ingest/crap.mjs`). A function with no statements and no
  branches (a docstring-only stub) counts as fully covered. A function no coverage entry matches
  (file outside the source roots, or shadowed by a later definition of the same name, which ruff
  reports as `F811`) has unknown coverage and fails with `crap-coverage-unknown`; nothing is
  guessed. `# pragma: no cover` keeps its coverage.py meaning (excluded lines are not statements).
  Identity: qualified name plus the same function-text hash, ratchet key the name, so an edited
  function over the limit fails only when its score rises.
- **Cache invalidation.** The metrics script, the new adapters, the shared structure and CRAP rule
  files, `shared/policy.mjs` and the pinned-version file are in the Python analyzer's configuration
  hash.
- **Tests.** `ingest/crap.test.mjs` (the join, on a real lizard CSV and coverage.py report),
  `python-structure.test.mjs`, `python-crap.test.mjs` (lizard resolution and failures) and
  `python-sources.test.mjs`, all with the fake toolchain; `core/python-cli.test.mjs` drives the CLI
  for a new violation, the touched-legacy ratchet, an untested complex function, unknown
  coverage, `thresholds.crapLimit` and a failing lizard. The gated e2e adds real branches for each
  (nested loops with four parameters, a legacy function edited and then grown, an untested branchy
  function) and runs the metrics script on a sample covering methods, decorators, `async`,
  `match`, `elif` chains and a file that does not parse.

## Slices

Each slice is one PR, adds one concern, and changes only the Python adapters, ingesters or rules,
tests, and this document.

| #   | Ticket                                                    | Slice                        | Tool and report                                                          | Findings                                                                                         | Status  |
| --- | --------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------- |
| PY1 | [#168](https://github.com/jhonDoe15/nitpicker/issues/168) | Base runner and CLI          | ruff, ruff format or black, pytest or unittest under coverage.py         | lint and format findings, `line-coverage`, `uncovered-function`, `tool-error`                    | done    |
| PY2 | [#169](https://github.com/jhonDoe15/nitpicker/issues/169) | Type checking, one-way rules | mypy or pyright; ruff rules and import rules for the one allowed way     | type errors; one-way rules with their failure messages; the Python skill                         | planned |
| PY3 | [#170](https://github.com/jhonDoe15/nitpicker/issues/170) | Structure limits and CRAP    | `ast` metrics script; lizard joined with the coverage report             | `function-*-limit` rules as for TypeScript and Java; `crap-score-limit`, `crap-coverage-unknown` | this PR |
| PY4 | [#171](https://github.com/jhonDoe15/nitpicker/issues/171) | Changed-branch coverage      | the coverage JSON branch data and the changed lines from git             | `changed-branch-coverage`                                                                        | planned |
| PY5 | [#172](https://github.com/jhonDoe15/nitpicker/issues/172) | Duplicates and coupling      | jscpd with the `python` format; import graph for stability               | `duplicate-clone`, `duplicate-clone-size`; `stability-direction`                                 | planned |
| PY6 | [#173](https://github.com/jhonDoe15/nitpicker/issues/173) | Mutation testing             | a Python mutation tool (mutmut or cosmic-ray), per docs/mutation-testing | `mutant-survived`, `mutant-nocoverage` (new surviving mutants fail)                              | planned |

Slice order follows what each one needs: PY2 to PY6 all reuse PY1's environment detection and
snapshot handling, PY3 and PY4 reuse its coverage report, and PY6 is last because it is the
slowest and needs the tests to pass reliably under the environment PY1 established. The custom
rules each slice adds are listed in [`spec/checks.md`](../spec/checks.md) (generated from
`shared/policy.mjs`) when they become enforced for Python; PY1 adds none, PY3 adds the six structure
and CRAP rules.

## Tests

- `core/python-cli.test.mjs`: fast, always on. The CLI end to end with a fake toolchain
  (`languages/python/adapters/fixtures/fake-python-tools.mjs` behind wrapper scripts in a
  `.venv/bin`, plus a fake `uv` and `poetry`): clean and failing changes in every report format,
  `exclude`, the legacy inventory, black and unittest detection, `uv.lock` and `poetry.lock`
  environments, tool errors (failing tests, a crashing tool, no environment), `--all`, rejected
  TypeScript-only keys, and that base and head each run with their own sources on `PYTHONPATH`.
- Unit tests next to the code: environment, formatter and source root detection, the tool steps
  (including long output and missing tools), the runner and its arguments, the analyzer, config
  validation and the coverage ingester (on a real coverage.py report).
- `languages/python/adapters/python-preset.e2e.test.mjs`: gated behind `NITPICKER_PYTHON_E2E=1`
  (`npm run test:python`). Needs python3, uv, ruff, black and network access to PyPI; about 50
  seconds. On `languages/python/adapters/fixtures/python-project` (one legacy ruff violation on the
  base, editable install in a `.venv`) it checks: a change that alters behaviour and updates its
  tests passes, which only works when base tests run against base code; a moved legacy violation
  stays baselined; a new unused import and an unformatted file fail in every report format;
  failing tests and a missing environment are tool errors with exit 2; a `unittest` project
  formatted with black passes and fails correctly using tools from the `PATH`; and a `uv.lock`
  project runs through `uv run`.
- `core/pack-contents.test.mjs` checks that the Python files, including the ruff config, are in
  the npm package.
