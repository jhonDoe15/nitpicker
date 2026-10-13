# Python preset

Status: slices 1, 2, 5 and 6 (tickets PY1, PY2, PY5 and PY6, mutation testing) implemented; the others are planned
below. The scope is a proposal pending owner review.

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
node languages/python/adapters/python-runner.mjs --part python     (analyzer python, per snapshot)
  -> ruff check  --config nitpicker-ruff.toml      -> ruff.sarif
  -> ruff format --check --diff | black --check    -> format.txt
  -> coverage run --branch -m pytest | unittest    -> coverage.json  (coverage.py JSON report)
  -> mypy --strict | pyright (strict)              -> type-check.json
  -> python -I nitpicker_rules.py                  -> rules.json     (the small AST checks)
  -> jscpd --format python (all source roots at once) -> duplicates.json
  -> python import-scan.py (stdlib ast)            -> imports.json    (modules and their imports)
  -> lint-imports (only with an import-linter config) -> import-linter.txt
  -> readPythonFindings                             (languages/python/adapters/python-reports.mjs)
node languages/python/adapters/python-runner.mjs --part mutation   (analyzer mutation, after python)
  -> mutmut run                                    -> findings read from mutmut's mutants/
compareFindings(base, head, renames) per analyzer   (core)
```

Reports are written to a temporary directory outside the project and removed afterwards, so
nothing is added to the analyzed tree (no caches, no `.coverage` file, no bytecode). That
directory is the contract between the tool runs and the readers; later slices add files to it.

- **Selection.** Explicit only: `"preset": "python"` in `nitpicker.config.json`. There is no
  auto-detection of `pyproject.toml`. `nitpicker` finds the project from the nearest directory with
  a `package.json` or a `nitpicker.config.json`, so a Python project needs no `package.json`.
- **Two analyzers.** `python` carries the findings of the tools named `ruff`, `ruff-format` or
  `black`, `coverage`, `mypy` or `pyright`, and `python-rules`; `mutation` (slice 6) carries those of `mutmut` and depends on `python`,
  so it runs after it and is skipped when it had a tool error. They are separate so that a missing
  or crashing mutmut costs only the mutation results, and `"disable": ["mutation"]` turns it off.
  `python` cannot be disabled alone, because `mutation` depends on it. The version is the versions of the tools in the
  project's environment (`ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;pytest@8.3.1`), read from the live checkout, and
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
| 5     | nothing                     | `ruff`, `black`, `coverage`, `mypy`, `pyright` and `python3` from the `PATH`                                 |

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

Config keys with this preset: `base`, `disable` (the analyzer names are `python` and `mutation`), `analyzers`, the keys shared by all languages,
`thresholds` (`crapLimit`, enforced from slice 3), `exclude` (findings under the globs are
dropped) and `legacyInventory` (same format and `baseline-expansion` rule as for Java), and the
`python` object below. `layout` and the top-level `exceptions` describe TypeScript source roots and
ESLint rules and stay a config error with this preset; the Python equivalent of `exceptions` is
`python.exceptions`. `python` is an error with any other preset.

```json
{
  "preset": "python",
  "python": {
    "environment": "uv",
    "formatter": "black",
    "testRunner": "pytest",
    "typeChecker": "mypy",
    "importLinter": false,
    "sourceRoots": ["src"],
    "exceptions": [
      {
        "rule": "T201",
        "paths": ["src/cli/**"],
        "reason": "Command line entry points print their result."
      }
    ]
  }
}
```

| Key            | Values                                 | Default                                                                              |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------------ |
| `environment`  | `uv`, `poetry`, `path`, or a directory | detected, see above                                                                  |
| `formatter`    | `ruff`, `black`                        | `black` if the project declares it (see below) and not ruff's formatter, else `ruff` |
| `testRunner`   | `pytest`, `unittest`                   | `pytest` if the project uses it (see below), else `unittest`                         |
| `typeChecker`  | `mypy`, `pyright`                      | detected from the project, see below                                                 |
| `importLinter` | `true`, `false`                        | run when the project has an import-linter config (see slice 5), else not             |
| `sourceRoots`  | non-empty array of project directories | `src`, else the top-level packages (directories with `__init__.py`), else `.`        |
| `exceptions`   | array of `{ rule, paths, reason }`     | none; see [Exceptions](#exceptions)                                                  |

The type checker is the one the project uses: `mypy` when it has a `[tool.mypy]` table (or
`[mypy]` in `mypy.ini`, `setup.cfg` or `tox.ini`), `pyright` when it has `pyrightconfig.json` or a
`[tool.pyright]` table (`[ tool.pyright ]` too). Failing that, whichever it declares as a
dependency (a requirements line, a quoted entry anywhere in a pyproject dependency array, the
`mirrors-mypy` or `pyright-python` hook). When both score the same, or neither does, nitpicker
runs `mypy --version` and then `pyright --version` in the environment and takes the first that
runs; `python.typeChecker` overrides all of it. The choice is read from the checkout you run `nitpicker` in, so base and head use the same
checker; a change that switches checker makes every finding of the new one new.

Existing violations are baselined with the legacy inventory, where `source` is the finding's
`identity` as printed in `new-findings.json` (`fp:nitpicker/subject=<ruff message>` for ruff, the
tool's message for the type checkers, the subject for the nitpicker rules). A whole path that is not
yours to fix (generated code) is dropped with `exclude`.

### Exceptions

There is no inline disable: `# noqa`, `# type: ignore`, `# pyright: ignore` and the other comments
in the table below are findings themselves. The way out is `python.exceptions` in
`nitpicker.config.json`, the Python counterpart of the TypeScript `exceptions` key and of the same
shape: `rule` (the id printed in the finding, for example `T201`, `PTH118`, `frozen-dataclass`,
`return-value`, `reportReturnType`), `paths` (a non-empty array of globs relative to the project)
and `reason` (required text). It lifts that rule for those paths, in the base and in the head
snapshot alike, and every exception is listed in the report's config overrides. The id is checked
when the config loads: a ruff code (or a prefix such as `PTH`, which covers every `PTH` code), a
`python-rules` id, a mypy error code or a pyright `report*` rule; a typo such as `T210` is a config
error, not a silent no-op. Prefer fixing the code; an exception is for code that is
legitimately outside the rule, such as a command line entry point that prints or a module that
must keep a mutable dataclass.

`exclude` is the other way out: it drops every finding under the globs, and the paths are not
handed to ruff or black either. The rules most likely to flag code that is right for its place are
`T201` (`print` in a command-line tool or a notebook), `PERF203` (`try` in a loop that must handle
each item) and `F401` (an `__init__.py` that re-exports): lift them for the path with
`python.exceptions`, or `exclude` the path, for example
`"exclude": ["src/demo/cli.py", "**/__init__.py"]`. The project's own ruff configuration
(`[tool.ruff]`, `ruff.toml`) and `[tool.coverage]` are not read for linting and coverage, so the
result means the same on every project; there is no override key for them.

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

## Slice 2: type checking and the one-way rules

The purpose of this slice is the "one way" for each construct. Every finding message names the
allowed form, and, because any rule can flag legitimate code, ends with how to add the exception.
Every enforceable finding of ruff, the type checkers and the rules ends with the `python.exceptions` sentence, except the two whose own advice differs (`no-inline-suppression`, mypy `unused-ignore`). The wording lives in `languages/python/rules/rule-hints.mjs`; a test checks that each rule's message
names its allowed form, and an opt-in test runs a banned and an allowed fixture of every rule
through the real tools.

- **Type checking.** `mypy --strict` or `pyright` with `typeCheckingMode: strict`, on the source
  roots. Strict is not configurable: a project that cannot pass yet baselines its existing errors
  (they only count when new), and a project's config cannot switch the check off. Only its
  environment settings apply. For mypy that is `plugins`, `mypy_path`, `python_version`, the
  namespace and typeshed options and, per module, `ignore_missing_imports` and `follow_imports`;
  `ignore_errors`, `disable_error_code`, `exclude` and every flag that weakens strict are dropped.
  Pyright gets a generated config that `extends` the project's (for `extraPaths`, `pythonVersion`
  and the like), then forces strict, `enableTypeIgnoreComments: false`, `ignore: []`, the source
  roots and nitpicker's `exclude` in place of the project's. Mypy also gets the environment's
  interpreter (`--python-executable`), so packages installed there resolve. Tests are not
  type-checked unless a source root contains them. Findings are one per diagnostic: tool `mypy` or `pyright`, rule the
  error code (`arg-type`) or rule name (`reportArgumentType`), identity the message text without `on line N` / `from line N` references (ruff messages such as F811 too), with `#n` for repeats in one file. Only the first line of a pyright message is used, since
  the detail lines vary with surrounding code. A checker that exits other than 0 or 1 is a
  `types-failed` tool error. The checker runs in the project's environment like pytest, so it must
  be installed there (or on the `PATH`).
- **Lint rules.** `languages/python/ruff/nitpicker-ruff.toml` selects, besides slice 1's rules,
  `PTH`, `UP031`, `UP032`, `FLY002`, `BLE001`, `S110` and `S112`, turns on
  `check-typed-exception` (so `except ValueError: pass` is swallowing too) and ignores `F405`
  (the star import itself is `F403`), `SIM105` (it recommends the swallowing form `S110` bans)
  and `RUF100` (every `noqa` is already a finding).
- **AST rules.** `languages/python/rules/nitpicker_rules.py` runs with `python -I` (standard
  library only, never importing project code) over the files `ruff check --show-files` lists, so
  it sees exactly the files ruff lints, honoring `.gitignore`. Findings have tool `python-rules`.
  Files that do not parse are left to ruff's syntax errors.

| Allowed form                                    | Banned form                                              | Rule                                                       |
| ----------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| `pathlib.Path`                                  | `os.path`, `open()`, `os.getcwd()`, ...                  | ruff `PTH*`                                                |
| f-strings                                       | `"...".format()`, `"..." % x`, `"".join` of a fixed list | ruff `UP031`, `UP032`, `FLY002`                            |
| `None` default, value built in the function     | a mutable default argument                               | ruff `B006`                                                |
| catch, handle, log or re-raise a specific error | bare `except:`, `except Exception:`, `except X: pass`    | ruff `E722`, `BLE001`, `S110`, `S112`                      |
| explicit imports                                | `from module import *`                                   | ruff `F403`                                                |
| `logging`                                       | `print`, `pprint`                                        | ruff `T201`, `T203`                                        |
| `@dataclass(frozen=True)`                       | `@dataclass` without `frozen=True`, outside tests        | `frozen-dataclass`                                         |
| pydantic in `adapters/` only                    | importing `pydantic` or `pydantic_settings` elsewhere    | `pydantic-boundary`                                        |
| an `enum.Enum` / `StrEnum`                      | a plain class of two string constants, or three `X_*`    | `enum-string-constants`                                    |
| fixing the code                                 | `# type: ignore`, `# noqa`, `# pyright: ignore`, ...     | `no-inline-suppression`                                    |
| annotated code the checkers read                | `@no_type_check`, `if not TYPE_CHECKING:`, a stub beside | `no-type-check`, `not-type-checking`, `stub-beside-source` |

Details that are decisions rather than the table:

- `frozen-dataclass` and `pydantic-boundary` do not apply to test files (a `tests` or `test`
  directory, `test_*.py`, `*_test.py`, `conftest.py`), where fakes mutate and tests exercise the
  adapters. `frozen=True` must be the literal `True`.
- The boundary is a directory named `adapters` anywhere in the path (`src/shop/adapters/api.py`),
  as in the TypeScript preset; a project that keeps its pydantic models elsewhere (`schemas/`,
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
- `ruff check` runs with `--ignore-noqa`, so a `noqa` never hides a finding either.

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
  the analyzer as tool (`python`, or `mutation` for `mutation-failed`) and path `.`, never a throw from the CLI: `ruff-failed`, `format-failed`, `tests-failed` (the project's own
  tests fail, the same rule the TypeScript preset uses), `coverage-failed`, `types-failed` and `rules-failed` (slice 2), `environment-failed`,
  `duplicates-failed`, `coupling-failed`, `import-linter-failed` (slice 5), `mutation-failed` (slice 6)
  and `python-failed` for anything unexpected. An environment that cannot be found at all (no
  `.venv` at the configured directory, no `uv sync`, poetry has none) is caught earlier, while the
  tool versions are read, and is reported as a plain tool error of each analyzer for each snapshot. Every failing step is reported, with the end of the tool output. The CLI
  exits 2 when nothing new failed, and a snapshot with a tool error is not compared, as for Java; the other analyzer is.
- **Not included.** Structure limits, CRAP and changed-branch coverage are the next slices (type
  checking and the one-way rules are slice 2, above). Multi-project
  repositories are analyzed one project root at a time. Windows is untested (mutation testing
  needs WSL, see slice 6).

## Slice 5: duplicates, coupling and import contracts

All three read only the production sources under `python.sourceRoots`. A file is not production
code when it is `test_*.py`, `*_test.py` or `conftest.py`, or sits under a directory named `tests`,
`test`, `migrations`, `build`, `dist`, `venv`, `site-packages`, `node_modules`, `__pycache__` or a
hidden one such as `.venv`; the same list feeds jscpd's `--ignore`, the import scan and the module
list. When the source root is `.` (a flat project without packages, or `python.sourceRoots`
saying so), the top-level `docs`, `doc`, `examples` and `scripts` directories are skipped too, as
the source root detection already does.

- **Duplicates.** jscpd (nitpicker's own pinned copy, `jscpd@x.y.z` in the analyzer version) runs
  once over all existing source roots with `--format python --mode mild` and a nitpicker-owned
  config (`jscpd-config.json` in the report directory: 50 tokens, 5 lines, no threshold), so a
  `.jscpd.json` of the project neither changes the result nor fails the run, and clones between
  sibling packages (`billing/` and `shipping/`) are found. The report goes through the same
  `runJscpd` and `evaluateDuplicates` the Java preset uses, so the findings are identical in shape:
  `duplicate-clone` (enforceable, one per clone) and `duplicate-clone-size` (descriptive `lines` and
  `tokens`), tool name `duplicates`. Identity is the sorted file pair, a hash of the cloned text and
  the n-th occurrence of that pair, never a line, so moving a legacy clone within its files keeps it
  baselined. Clones that consist only of import statements or `__all__` re-export lists are dropped
  (`importsOnly`); a clone that also carries code is still reported. The finding is on the first
  file of the pair, and its message tells to add that file to `exclude` when the repetition is
  intended. A source root of `.` is supported.
- **Coupling.** `python -I languages/python/adapters/import-scan.py` (the project's interpreter,
  standard library only) parses every production file with `ast` and prints each file's `import`
  and `from ... import` statements, including those inside functions and `if TYPE_CHECKING:`
  blocks. Everything else is JavaScript (`python-coupling.mjs`) so it is unit-tested without Python:
  a module is a `.py` file named relative to its import root (`a/b.py` is `a.b`, `a/__init__.py` is
  `a`), a package is the module's containing package (a package's `__init__` belongs to the package
  itself, a top-level module to `(root)`), relative imports are resolved against the importing
  module, and an import is an edge to the longest module the sources define (`import a.b.c.Thing`
  links `a.b.c`; `from a import b` links `a.b` when that is a module, else `a`). Imports of anything
  outside the sources (the standard library, third-party packages) are not edges. The graph goes to
  the shared `buildCouplingReport`, which the Java preset now uses too, and then `evaluateCoupling`:
  report-only `coupling`, `module-coupling`, `package-coupling`, `stability-direction-metric`, and
  the enforceable `stability-direction` (`<package> depends on less stable package <package>`),
  tool name `coupling`, identity `package-edge:<source>-><target>`. Its path is the source
  package's `__init__.py` (the package's first file when it has none), and the message says to
  depend on an abstraction in a more stable package, or to add that file to `exclude` when the
  inversion is intended. An edge can appear without anyone touching it, because package
  instability moves when other packages change. As in Java, packages are flat
  (`a.b` and `a.b.c` are different packages) and fan-in and fan-out count distinct files. A file
  that does not parse with the interpreter is left out of the graph (ruff already reports syntax
  errors), so one legacy Python 2 file does not break the gate.
- **grimp or an `ast` scan?** An `ast` scan, shipped with nitpicker. grimp must be installed into
  the project's environment, which nitpicker never modifies, needs the root packages to be
  importable (editable installs and `PYTHONPATH` become part of the contract), and would add a
  Rust dependency only to produce what a few dozen lines of `ast` already give: module-to-module import
  edges. What grimp adds (external packages, import chains, squashed packages) is import-linter's
  job, and import-linter, which brings grimp, runs when the project uses it.
- **import-linter.** When the snapshot has an import-linter config (`.importlinter`, or a
  `[importlinter]` section in `setup.cfg` or `tox.ini`, or `[tool.importlinter]` in
  `pyproject.toml`), `lint-imports --no-cache` runs in the project's environment, with the
  snapshot's sources on `PYTHONPATH` as for the other tools. The project's `import-linter` version
  (read from the installed package metadata, since `--version` only exists from 2.11) is part of
  the analyzer version. `python.importLinter` overrides the detection (`false` never runs it,
  `true` always does). import-linter 1.12 or newer is supported (the first with `--no-cache`); the
  startup logo is not suppressed because `--no-logo` only exists from 2.14, and the parser skips
  it. It has no machine-readable output, so the text report is parsed
  (`languages/python/ingest/import-linter.mjs`, tested on real output of the forbidden, layers,
  independence, protected and acyclic contracts): every import chain in the `Broken contracts`
  section is one enforceable `contract-broken` finding, tool `import-linter`, on the file of the
  chain's first module with the line of its first import, identity
  `contract:<name>:<module> -> <module> -> ...` (no line numbers, so a legacy broken contract stays
  baselined when lines move). A hop prints either `(l.1, 2, 3)` or `(l.1, l.2, l.3)` depending on the
  version; both are read. Items of contract types that do not print import chains (acyclic
  siblings) are reported by their text, and a broken contract with nothing readable is one finding
  for the contract; these have path `.`, so their message says only to remove the import. Findings
  on a file say how to except it: `exclude` in `nitpicker.config.json`. A run that checked no
  contract (missing config file, `lint-imports` not installed in the environment, which the
  message answers with `"python": { "importLinter": false }`) is an `import-linter-failed` tool
  error, as `duplicates-failed` and `coupling-failed` are for the other two steps.
- **Policy.** `duplicate-clone` and `stability-direction` are enforced for Python in
  `shared/policy.mjs` (`spec/checks.md`). `contract-broken` is a Python-only tool rule and has no
  shared policy entry.

## Slice 6: mutation testing

Mutation testing follows [mutation-testing.md](mutation-testing.md) and the shared mutation rule
(`shared/rules/mutation.mjs`, the one the Java preset's PIT ingester feeds too): no score gate, a
new `Survived` mutant fails as `mutant-survived`, a new `NoCoverage` mutant fails as
`mutant-nocoverage`, and every other status (`Timeout`, `RuntimeError`, `CompileError`, `Ignored`)
is a descriptive finding that never fails. A mutant is identified by its function (`Class.method`),
the original and the mutated text and its occurrence among identical mutants of that status in the
function, never by a line number, so edits above a survivor keep it baselined. The line is only the
location.

- **Tool: mutmut 3.x**, in the project's environment like the other tools. This is the one
  supported range (developed and tested against 3.8): the major version is checked before the run,
  and a run whose results do not look like mutmut 3's is an error, not a pass. It has to be
  installed there (a dev dependency); a missing mutmut is a `mutation-failed` tool error of the
  `mutation` analyzer that says so and names `"disable": ["mutation"]`, and nothing else is lost.
  The version in the cache key is read from the package metadata (`mutmut --version` fails in a
  project where mutmut cannot guess its source directory).
- **What runs.** `mutmut run` in the snapshot, as the `mutation` analyzer, after the `python`
  analyzer and only when it had no tool error (a failing test run is already `tests-failed`, and
  mutmut starts with a clean run of the same tests). When pytest-xdist is installed the run gets
  `PYTEST_ADDOPTS=-n0` (merged after any value the environment already has), because mutmut runs
  pytest itself and cannot collect which tests cover which function under `-n`. The snapshot is a
  disposable work tree; mutmut writes its `mutants/` directory into it. On head the directory is
  removed afterwards. On base it stays, because head reads its results (see below). Keep `mutants/`
  out of version control in your project, like `.venv/`. A project whose tests collect no test
  gets no mutation findings (`python/no-tests-ran` already says it).
- **Configuration.** mutmut reads `[tool.mutmut]` in `pyproject.toml` (or `[mutmut]` in
  `setup.cfg`). If the project has one, it is used as it is: `source_paths`, `also_copy`,
  `do_not_mutate`, `pytest_add_cli_args` and the rest stay the project's decision, and `exclude`
  then only drops findings afterwards. If it has none, nitpicker adds one to the snapshot's
  `pyproject.toml` (never to your checkout, and it creates the file if the project has none, so
  that file is the one thing besides `mutants/` the preset writes into the snapshot):
  `source_paths` is the source roots and `do_not_mutate` skips the test files (`tests/`,
  `test_*.py`, `*_test.py`, `conftest.py`) and the `exclude` globs, so an excluded file that mutmut
  cannot parse (a Python 2 leftover) does not fail the run. Source roots of `.` are an error in
  that case, since mutmut would copy the whole project: set `python.sourceRoots` or
  `[tool.mutmut]`. A test that reads a file outside the copied sources fails mutmut's first run
  ("failed to collect stats"); the error then adds a line to list the file under `also_copy` in
  `[tool.mutmut]`.
- **Equivalent mutants.** mutmut also mutates strings and logging, so some survivors cannot be
  killed by any test. The ways out are in the configuration, not in the code: list the path in
  `exclude` (the mutants of the file are dropped), or, with a `[tool.mutmut]` of your own, list it
  in `do_not_mutate`, which also saves the run time.
- **pytest.** mutmut 3 runs the suite with pytest, which also runs `unittest.TestCase` classes. A
  project whose runner is `unittest` therefore needs pytest installed for mutation testing; set
  `"testRunner": "unittest"` if you want coverage.py to keep running `unittest discover`.
- **Windows.** mutmut forks processes (`os.fork`), so it does not run on native Windows: run
  nitpicker inside WSL. On Windows the `mutation` analyzer does not run mutmut; it reports a
  descriptive `mutation-skipped` finding that says so (the other analyzer is unaffected).
- **A run with nothing covered.** When no test reaches any mutant mutmut stops with exit status 1
  and "could not find any test case for any mutant", leaving every result unchecked. That is not a
  tool error: every mutant is reported as `NoCoverage` (and a project with nothing to mutate
  reports nothing).
- **Summary.** One descriptive `mutation-summary` metric per status (`Killed`, `Survived`,
  `NoCoverage`, ...), counted over every mutant mutmut kept a result for, as for the other
  languages.

### Why mutmut, and how its results are read

mutmut 3 has no report file: `mutmut results` prints text for humans, `export-cicd-stats` only
counts, and the results live in `mutants/`. What was observed on mutmut 3.8.0 (the other 3.x
releases are assumed to look alike, which is why a run that does not is rejected):

- `mutants/<source file>.meta` is JSON with `exit_code_by_key` (`module.x_function__mutmut_N` to
  the exit status of the test run: 0 survived, 1 or 3 killed, 33 or 5 no tests, 36 and a few more
  timeout, 37 caught by the type checker, `null` not checked). The other keys of the file change
  from one minor release to the next, so they are not read.
- `mutants/<source file>` is the generated code: `x_function__mutmut_orig` and one
  `x_function__mutmut_N` per mutant, whole functions. Diffing the two on tokens gives the original
  and mutated text, and finding the original function in the real file gives the line. mutmut does
  not record the mutation operator, so the text change stands in for it (the message only says
  whether a number, a string, an operator or an expression changed). The numbers `N` shift when a
  mutant is added above, which is why they are not part of the identity.
- `python-mutation-data.mjs` reads those files and `languages/python/ingest/mutmut.mjs` turns them
  into findings. A `.meta` file without `exit_code_by_key`, or results none of whose names has the
  form `module.x_function__mutmut_N`, is a tool error that names the supported mutmut, not a
  silent pass.

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

mutmut reuses a result when the text of the mutated function is unchanged, which is wrong when
only something it calls changed: a mutant of an unchanged caller can go from killed to survived
without its own function changing. So the results of a changed module and of every module that
imports it, directly or through other modules, are not copied. The import graph is the one of the
coupling analysis (slice 5): the `ast` scan of the production modules under the source roots of
head (`import-scan.py`), with the same import resolution. A result file of a module that scan did
not list (under `migrations/`, `build/` and the like) is not copied either, and a change to such a
file reuses nothing, since its importers are unknown. If the scan fails, nothing is reused. Calls
made without an import in the caller (`importlib`, `getattr` on a module object passed in) are not
seen, and neither is state shared through files. The saving is therefore the modules that are unrelated to the change, which
is the common case in a project with several packages and little in a small one.

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

| #   | Ticket                                                    | Slice                        | Tool and report                                                      | Findings                                                                                          | Status  |
| --- | --------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------- |
| PY1 | [#168](https://github.com/jhonDoe15/nitpicker/issues/168) | Base runner and CLI          | ruff, ruff format or black, pytest or unittest under coverage.py     | lint and format findings, `line-coverage`, `uncovered-function`, `tool-error`                     | done    |
| PY2 | [#169](https://github.com/jhonDoe15/nitpicker/issues/169) | Type checking, one-way rules | mypy or pyright; ruff rules and import rules for the one allowed way | type errors; one-way rules with their failure messages; the Python skill                          | done    |
| PY3 | [#170](https://github.com/jhonDoe15/nitpicker/issues/170) | Structure limits and CRAP    | function metrics (lizard or ast) joined with the coverage report     | `function-*-limit` rules as for TypeScript and Java; `crap-score-limit`, `crap-coverage-unknown`  | planned |
| PY4 | [#171](https://github.com/jhonDoe15/nitpicker/issues/171) | Changed-branch coverage      | the coverage JSON branch data and the changed lines from git         | `changed-branch-coverage`                                                                         | planned |
| PY5 | [#172](https://github.com/jhonDoe15/nitpicker/issues/172) | Duplicates and coupling      | jscpd with the `python` format; import graph for stability           | `duplicate-clone`, `duplicate-clone-size`; `stability-direction`; import-linter `contract-broken` | done    |
| PY6 | [#173](https://github.com/jhonDoe15/nitpicker/issues/173) | Mutation testing             | mutmut 3 run data, per docs/mutation-testing                         | `mutant-survived`, `mutant-nocoverage` (new surviving mutants fail)                               | done    |

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
  of a repository and a real `python3` for the import scan; the fake `mutmut` writes a `mutants/`
  directory from a `mutants-data.json` in the project and logs which result files it found there.
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
  a source-only change that adds a survivor is caught while reusing the base results, a change to a
  callee is caught in its unchanged caller (not reused), and a project with xdist in its `addopts`
  and an excluded Python 2 file mutates with the `[tool.mutmut]` that nitpicker adds. The
  `unittest` project mutates with a `[tool.mutmut]` that nitpicker adds, and the xdist project with
  its own `[tool.mutmut]` runs without a `-n 0` workaround.
- Slice 2: `languages/python/rules/rule-hints.test.mjs` (always on) checks that every rule has a
  banned and an allowed fixture directory and that its message names the allowed form and the
  exception route; `type-check.test.mjs`, `rules-report.test.mjs`, `python-types.test.mjs`,
  `python-ast-rules.test.mjs` and `python-exceptions.test.mjs` cover the ingesters, the two new
  steps and the exception filter with the fake toolchain.
- `languages/python/rules/rule-cases.e2e.test.mjs` and `nitpicker-rules.e2e.test.mjs`: gated behind
  `NITPICKER_PYTHON_E2E=1` too. The first runs the banned and the allowed fixture of every rule
  (`languages/python/rules/fixtures/<case>/{banned,allowed}`) through the real ruff, python3, mypy
  and pyright from the `PATH`; the second drives `nitpicker_rules.py` over edge cases (test files,
  nested classes, comment forms). The preset e2e test also gates type errors with mypy and pyright,
  the one-way rules and `python.exceptions` end to end.
- `core/pack-contents.test.mjs` checks that the Python files, including the ruff config and the
  rules script, are in the npm package.
- Slice 5 unit tests: `python-sources.test.mjs` (module naming, exclusions), `python-coupling.test.mjs`
  (import resolution, packages, stability direction, the scan step with a fake interpreter),
  `python-duplicates.test.mjs` (real jscpd on small projects), `python-import-linter.test.mjs`
  (config detection, the run, failures), `ingest/import-linter.test.mjs` (real import-linter 2.15
  output in `ingest/fixtures`), `shared/rules/coupling-report.test.mjs`, and CLI cases in
  `core/python-cli.test.mjs` using the fake `lint-imports` and an `import-scan.json` the fake
  interpreter prints. The e2e file has a layered `shop` project (a copy fails as a duplicate; a
  domain package importing the web package fails as `stability-direction` and as two broken
  import-linter chains; `importLinter: false` skips the contracts; a clean change passes) and needs
  `import-linter` from PyPI.
- `core/pack-contents.test.mjs` checks that the Python files, including the ruff config and the
  import scan, are in the npm package.
