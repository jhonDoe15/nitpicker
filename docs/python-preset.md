# Python preset

Status: slices 1, 2, 3, 4, 5 and 6 (tickets PY1, PY2, PY3, PY4, PY5 and PY6) implemented; the others are planned below.
The scope is a proposal pending owner review.

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
  -> mypy --strict | pyright | basedpyright (strict) -> type-check.json
  -> python -I nitpicker_rules.py                  -> rules.json     (the small AST checks)
  -> python structure_metrics.py                    -> structure.json  (slice 3; also the CRAP input)
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
  `black`, `coverage`, `mypy`, `pyright` or `basedpyright`, and `python-rules`; `mutation` (slice 6) carries those of `mutmut` and depends on `python`,
  so it runs after it and is skipped when it had a tool error. They are separate so that a missing
  or crashing mutmut costs only the mutation results, and `"disable": ["mutation"]` turns it off.
  Disabling `python` turns `mutation` off too, because `mutation` depends on it. The version is the versions of the tools in the
  project's environment (`ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;pytest@8.3.1`), read from the live checkout, and
  the configuration hash covers the Python adapter files, the nitpicker-owned ruff config and the
  `python` settings. Upgrading ruff, or editing the preset, therefore invalidates the base cache.
- **Ingesters.** Nothing generic was moved. The Java ingesters are reused where they already are:
  `languages/java/ingest/sarif.mjs` (ruff), `format-check.mjs` (the format check) and `common.mjs`.
  The one new ingester is `languages/python/ingest/coverage-reports/coverage-json.mjs` for the coverage.py JSON
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
| 5     | nothing                     | `ruff`, `black`, `coverage`, `mypy`, `pyright`, `basedpyright` and `python3` from the `PATH`                 |

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

Why not the dependency hook (`languages/typescript/adapters/dependency-graph/dependency-hooks.mjs`)? A hook installs
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
`thresholds` (`crapLimit`, enforced from slice 3, the file limits `fileLines`, `testFileLines`,
`lineLength` and `folderFiles`, and the [slow test](#slow-tests) budgets `unitTestSeconds` and
`integrationTestSeconds`), `testConsole` (see [new console output](#new-console-output-from-tests)), `exclude` (findings under the globs are dropped) and
`legacyInventory` (same format and `baseline-expansion` rule as for Java), and the `python` object
below. `layout` describes TypeScript source roots and stays a config error with this preset. The
top-level `exceptions` is accepted only for the file limits shared by every language
(`file-lines-limit`, `line-length-limit`, `folder-files-limit`) and `test-console-output`, whose
check the TypeScript preset shares; the Python equivalent of
`exceptions` for every other rule is `python.exceptions`. `python` is an error with any other preset.
Where each kind of finding is lifted for some paths:

| Findings                                                                                     | Lifted by                                                       |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| ruff codes (or a prefix such as `PTH`), mypy codes, pyright and basedpyright `report*` rules | `python.exceptions`                                             |
| `python-rules` ids (`sleep-in-test`, `unused-option`, `no-inline-suppression`, ...)          | `python.exceptions`                                             |
| `test-runtime/slow-test`                                                                     | `python.exceptions`                                             |
| `test-console/test-console-output`                                                           | top-level `exceptions` or `python.exceptions` (the same filter) |
| one third-party console message                                                              | `testConsole.allow`                                             |
| `file-lines-limit`, `line-length-limit`, `folder-files-limit`                                | top-level `exceptions` only                                     |

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
| `typeChecker`  | `mypy`, `pyright`, `basedpyright`      | detected from the project, see below                                                 |
| `importLinter` | `true`, `false`                        | run when the project has an import-linter config (see slice 5), else not             |
| `sourceRoots`  | non-empty array of project directories | `src`, else the top-level packages (directories with `__init__.py`), else `.`        |
| `entryPoints`  | array of project-relative globs        | none; see [Composition roots](#the-shared-one-way-rules)                             |
| `exceptions`   | array of `{ rule, paths, reason }`     | none; see [Exceptions](#exceptions)                                                  |

`python.entryPoints` lists the files that start the program, such as a job runner or a worker that
reads its settings from the environment (see the composition roots below). Adding a file there
loosens `process-env-access`, so the policy-change list reports it as a loosening and a removal as
a change, like `layout.entryPoints`; the base snapshot is measured with the entry points both
sides declare.

The type checker is the one the project uses: `mypy` when it has a `[tool.mypy]` table (or
`[mypy]` in `mypy.ini`, `setup.cfg` or `tox.ini`), `pyright` when it has `pyrightconfig.json` or a
`[tool.pyright]` table (`[ tool.pyright ]` too), `basedpyright` when it has a `[tool.basedpyright]`
table. Failing that, whichever it declares as a
dependency (a requirements line, a quoted entry anywhere in a pyproject dependency array, the
`mirrors-mypy`, `pyright-python` or `basedpyright-pre-commit-mirror` hook). basedpyright also reads
`pyrightconfig.json` and `[tool.pyright]`, so once the project declares or configures
basedpyright those two no longer count for pyright: a project with a `[tool.pyright]` table and a
`basedpyright` dependency runs basedpyright. When two score the same, or none does, nitpicker
runs `mypy --version`, then `pyright --version`, then `basedpyright --version` in the environment and
takes the first that runs; `python.typeChecker` overrides all of it. The choice is read from the checkout you run `nitpicker` in, so base and head use the same
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
`python-rules` id, a mypy error code or a pyright or basedpyright `report*` rule; a typo such as `T210` is a config
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
result means the same on every project; there is no override key for them (the coverage settings that are dropped are listed under the test step below).

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
Every enforceable finding of ruff, the type checkers and the rules ends with the `python.exceptions` sentence, except the two whose own advice differs (`no-inline-suppression`, mypy `unused-ignore`). The wording lives in `languages/python/rules/hints/` (assembled by `rule-hints.mjs`); a test checks that each rule's message
names its allowed form, and an opt-in test runs a banned and an allowed fixture of every rule
through the real tools.

- **Type checking.** `mypy --strict`, `pyright` or `basedpyright` with `typeCheckingMode: strict`, on the source
  roots. Strict is not configurable: a project that cannot pass yet baselines its existing errors
  (they only count when new), and a project's config cannot switch the check off. Only its
  environment settings apply. For mypy that is `plugins`, `mypy_path`, `python_version`, the
  namespace and typeshed options and, per module, `ignore_missing_imports` and `follow_imports`;
  `ignore_errors`, `disable_error_code`, `exclude` and every flag that weakens strict are dropped.
  Pyright gets a generated config that `extends` the project's (for `extraPaths`, `pythonVersion`
  and the like), then forces strict, `enableTypeIgnoreComments: false`, `ignore: []`, `executionEnvironments: []`, the source
  roots and nitpicker's `exclude` in place of the project's. basedpyright runs the same way, with the
  same generated config, and the same strict mode: it names its modes `off`, `basic`, `standard`,
  `strict`, `recommended` and `all`, and nitpicker forces `strict` (not `all`, whose extra rules such as
  `reportAny` and `reportUnusedCallResult` are style opinions, nor `recommended`, its default), so the
  two checkers report the same rules. A project's `[tool.basedpyright]` or `[tool.pyright]` table,
  `pyrightconfig.json` is the one that `extends` (the file first, else the pyproject table; basedpyright
  does not read a `basedpyrightconfig.json`, so neither does nitpicker), and a baseline file (`.basedpyright/baseline.json`) is not read, since the
  generated config lives in the report directory. Mypy also gets the environment's
  interpreter (`--python-executable`), so packages installed there resolve. Tests are not
  type-checked unless a source root contains them. Findings are one per diagnostic: tool `mypy`, `pyright` or `basedpyright`, rule the
  error code (`arg-type`) or rule name (`reportArgumentType`), identity the message text without `on line N` / `from line N` references (ruff messages such as F811 too), with `#n` for repeats in one file. Only the first line of a pyright or basedpyright message is used, since
  the detail lines vary with surrounding code. A checker that exits other than 0 or 1 is a
  `types-failed` tool error. The checker runs in the project's environment like pytest, so it must
  be installed there (or on the `PATH`).
- **Lint rules.** `languages/python/ruff/nitpicker-ruff.toml` selects, besides slice 1's rules,
  `PTH`, `UP031`, `UP032`, `FLY002` and `BLE001`, and ignores `F405`
  (the star import itself is `F403`), `SIM105` (the `swallowed-exception` rule below covers that
  form) and `RUF100` (every `noqa` is already a finding). `S110` and `S112` are not selected:
  `swallowed-exception` reports what they did, and more, once and under one id. The shared
  one-way rules add the groups `G` (logging calls), `N` (PEP 8 naming), `ERA` (commented-out
  code), `ARG` (unused arguments), `PT` (pytest style), `S` (security) and `TRY` (exceptions), and
  the single rules `PLR2004`, `PLW0602`, `PLW0603`, `FBT001` and `FBT002`; the last section of this
  slice lists each one with its allowed form and the rules of those groups that are left off.
  The groups `RUF`, `G`, `N`, `PT`, `S` and `TRY` are selected by listing their stable codes, not
  by prefix, so a later ruff cannot add a rule (or a preview rule) to the gate. `ruffConfigFor`
  (`adapters/configuration/python-ruff-config.mjs`) writes the toml into the report directory
  without the codes that the installed ruff does not know or lists as preview or removed
  (`ruff rule --all --output-format json`), which lets ruff 0.9 up to 0.16 run the same selection;
  a prefix such as `E4` or `T20` stays when a known rule starts with it. Test files are the ones
  pytest collects (the `python_files` patterns, `testpaths`, `conftest.py`, any `tests` or `test`
  folder, `test_*.py`, `*_test.py`): ruff's `ARG`, `FBT`, `PLR2004` and `S` findings in them are
  dropped after ruff runs (`rules/filters/ruff-allowed-forms.mjs`).
- **AST rules.** `languages/python/rules/nitpicker_rules.py` runs with `python -I` (standard
  library only, never importing project code) over the files `ruff check --show-files` lists, so
  it sees exactly the files ruff lints, honoring `.gitignore`. Findings have tool `python-rules`.
  Files that do not parse are left to ruff's syntax errors.

| Allowed form                                    | Banned form                                                                  | Rule                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `pathlib.Path`                                  | `os.path`, `open()`, `os.getcwd()`, ...                                      | ruff `PTH*`                                                |
| f-strings                                       | `"...".format()`, `"..." % x`, `"".join` of a fixed list                     | ruff `UP031`, `UP032`, `FLY002`                            |
| `None` default, value built in the function     | a mutable default argument                                                   | ruff `B006`                                                |
| catch and handle a specific error, or re-raise  | bare `except:`, `except Exception:`                                          | ruff `E722`, `BLE001`                                      |
| re-raise, return a failure value or a default   | `except X:` that only passes, continues, logs, returns or assigns a constant | `swallowed-exception`                                      |
| `contextlib.suppress(SpecificError)`            | `contextlib.suppress(Exception)`, `BaseException` or no argument             | `blind-suppress`                                           |
| explicit imports                                | `from module import *`                                                       | ruff `F403`                                                |
| `logging`                                       | `print`, `pprint`                                                            | ruff `T201`, `T203`                                        |
| `@dataclass(frozen=True)`                       | `@dataclass` without `frozen=True`, outside tests                            | `frozen-dataclass`                                         |
| pydantic in `adapters/` only                    | importing `pydantic` or `pydantic_settings` elsewhere                        | `pydantic-boundary`                                        |
| an `enum.Enum` / `StrEnum`                      | a plain class of two string constants, or three `X_*`                        | `enum-string-constants`                                    |
| fixing the code                                 | `# type: ignore`, `# noqa`, `# pyright: ignore`, ...                         | `no-inline-suppression`                                    |
| annotated code the checkers read                | `@no_type_check`, `if not TYPE_CHECKING:`, a stub beside                     | `no-type-check`, `not-type-checking`, `stub-beside-source` |
| a docstring that says what the name cannot      | a docstring that restates the name, or over 5 lines                          | `restating-docstring`, `long-docstring`                    |
| one plural input, a one-element list            | optional `tag` beside optional `tags: list[...]`                             | `singular-and-plural-field`                                |
| `match` or `if`/`elif` ending in `assert_never` | `x == E.A or x == E.B` over some members of an enum                          | `exhaustive-enum-predicate`                                |
| calling (or importing) the target directly      | a module-level function that only forwards to another                        | `forwarding-wrapper`                                       |
| a parameter some real call passes               | an optional parameter (with a default) that no call passes                   | `unused-option`                                            |

Details that are decisions rather than the table:

- `frozen-dataclass` and `pydantic-boundary` do not apply to test files, where fakes mutate and
  tests exercise the adapters. Test files are the same everywhere in this preset: `test_*.py`,
  `*_test.py`, a Django-style `tests.py`, `conftest.py`, anything under a `tests` or `test`
  directory at any depth, and anything under a `testing` directory at the project root (next to
  `src/` or the package). A `testing` package inside the package (`shop/testing/`, like
  `numpy.testing`) is shipped code and is checked as production (`TEST_DIRECTORIES`,
  `TOP_LEVEL_TEST_DIRECTORIES`, `TEST_FILE_GLOBS` and `isTestPath` in
  `execution/python-project.mjs`; the rules script gets the list of test files from it). `frozen=True` must be the literal `True`.
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
- `swallowed-exception` flags an `except` handler whose body does nothing with the error: every
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
  one expected error, and the `python.exceptions` entry for `swallowed-exception` for a handler that
  must stay (a lookup that answers `False` for bad input, say). Untested `except` handlers are not
  gated by branch coverage either, since coverage.py emits no arcs for them.
- `blind-suppress` closes the way around the rule above: `contextlib.suppress(Exception)`,
  `suppress(BaseException)` (also `builtins.Exception`, an import alias, and a list holding either
  of them) and `suppress()` with no argument ignore every error, as the bare `except Exception:` it
  stands for. The subject is the call as written with the resolved name, for example
  `contextlib.suppress(Exception)`; a `suppress` imported from anywhere other than `contextlib` is
  not checked. The message points to naming the expected exception, or handling or logging the
  error, and to the `python.exceptions` entry for `blind-suppress`.
- `ruff check` runs with `--ignore-noqa`, so a `noqa` never hides a finding either.

### The shared one-way rules

These rules bring the Python preset to the rules the TypeScript and Java presets enforce. Each
finding names the allowed form first and ends with the usual `python.exceptions` sentence. The
rules marked "script" are `python-rules` findings of `nitpicker_rules.py` (one module per concern
under `languages/python/rules/`: `checks`, `boundary`, `smells`, `honesty`); the others are ruff
rules. Rules that are not enforced because they flag idiomatic code with no clean alternative
are listed at the end.

| Concern                  | Allowed form                                                                                           | Rule                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logging                  | `logger.info("Loaded %s", count)`, `logger.warning`, `logger.exception` (structlog, loguru: see below) | ruff `G001`-`G004`, `G010`, `G101`, `G201`, `G202`, `TRY400`, `TRY401`                                                                               |
| Environment              | read once in a composition root, pass values in                                                        | `process-env-access` (script)                                                                                                                        |
| Shell                    | a list: `subprocess.run(["git", "status"], check=True)`                                                | `shell-command` (script), ruff `S602`, `S604`, `S605`, `S609`                                                                                        |
| SQL                      | parameters: `cursor.execute("select * from t where id = %s", (id,))`                                   | `sql-string-formatting` (script)                                                                                                                     |
| Path traversal           | `target = (base / name).resolve()`, then `target.is_relative_to(base)`                                 | `unsafe-path-join` (script)                                                                                                                          |
| Magic numbers            | a named constant                                                                                       | ruff `PLR2004`                                                                                                                                       |
| Naming                   | PEP 8: `CapWords`, `snake_case`, `UPPER_SNAKE_CASE`, `...Error`                                        | ruff `N`                                                                                                                                             |
| Boundary                 | parse untrusted data once with the project's validator (pydantic by default) in `adapters/`            | `handwritten-boundary-guard` (script)                                                                                                                |
| Types in the domain      | real types, `Protocol`, frozen dataclasses                                                             | `any-in-domain`, `pydantic-any-field`, `pydantic-extra-allow` (script)                                                                               |
| Pure domain              | clock, ids and random values passed in; ports implemented in `adapters/`                               | `clock-now`, `random-in-domain`, `io-in-domain` (script)                                                                                             |
| Module state             | state in an object made in the composition root                                                        | `module-level-mutable-state` (script), ruff `PLW0602`, `PLW0603`                                                                                     |
| Risky APIs               | JSON instead of pickle or marshal, a specific exception class                                          | ruff `S301`, `S302`, `TRY002`, `TRY004`, `TRY201`, `TRY203`                                                                                          |
| Deprecated APIs          | the replacement the deprecation notice names                                                           | mypy `deprecated`, pyright and basedpyright `reportDeprecated`                                                                                       |
| Repeated strings         | a constant or enum member                                                                              | `repeated-string-literal` (script)                                                                                                                   |
| Unused arguments         | remove the argument, or prefix it with `_` when the signature is fixed                                 | ruff `ARG001`-`ARG005`                                                                                                                               |
| Generic names            | a name for the job (`price_rounding.py`, `OrderRepository`)                                            | `generic-name` (script)                                                                                                                              |
| Secrets                  | read from the environment; log only that a secret is set                                               | `hardcoded-secret`, `credential-shape`, `secret-in-log` (script)                                                                                     |
| Boolean flags            | keyword-only (`def send(message, *, urgent=False)`) or two functions                                   | ruff `FBT001`, `FBT002`                                                                                                                              |
| Input or output per item | one batch call, or `asyncio.gather`                                                                    | `io-in-loop` (script)                                                                                                                                |
| Task markers             | `# TODO(#123): ...` with an issue                                                                      | `todo-without-issue` (script)                                                                                                                        |
| Commented-out code       | delete it                                                                                              | ruff `ERA001`                                                                                                                                        |
| Security sinks           | parameterized queries, `sha256`, verified TLS, a timeout, `yaml.safe_load`, `defusedxml`               | ruff `S` (see below)                                                                                                                                 |
| Test honesty             | a reason on every skip, no sleeping, no tautologies, fixed time and seeded random values, no network   | ruff `PT`, `skipped-test-without-reason`, `sleep-in-test`, `tautological-assert`, `real-clock-in-test`, `random-in-test`, `network-in-test` (script) |
| Test layout              | tests in files pytest collects; helpers in the tests folder                                            | `uncollected-tests`, `test-helper-in-source` (script)                                                                                                |

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
  `[project.entry-points]`, poetry, flit) or `setup.cfg`; or a file matched by `python.entryPoints`.
  Nothing under a `domain` folder is a composition root.
- `shell-command` reports running a command through a shell: `shell=True` or a `shell=` value that
  is not a literal (also from `**{"shell": True}`), a list starting with `sh`, `bash`, `cmd`,
  `powershell` and the other shells followed by `-c`, `/c` or a similar flag, and the `subprocess`,
  `os.exec*`, `os.spawn*`, `pty.spawn` and `asyncio.create_subprocess_*` calls (also
  `create_subprocess_shell`). A list of arguments, or a fixed command string that ruff already
  accepts, is the allowed form. Not in tests.
- `sql-string-formatting` reports an f-string, `%`, `+` or `.format` that builds SQL text (a
  `select ... from`, `insert ... values`, `update ... set` or `delete from`) and reaches
  `execute`, `executemany`, `text`, `raw`, `RawSQL`, `extra` or a pandas `read_sql*` call, directly or
  through a local variable. It replaces ruff's `S608`, which flags every string that looks like SQL;
  a formatted query that is not passed to one of those calls is not reported.
- `clock-now`, `random-in-domain`, `io-in-domain` and `any-in-domain` apply to a directory named
  `domain` anywhere in the path (not tests). `io-in-domain` reports `open`, `input`, `time.sleep`,
  `os.system` and imports of `subprocess`, `socket`, `requests`, `httpx`, `urllib.request`,
  database and cloud clients and similar.
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
- `repeated-string-literal` counts a string of five characters or more used three times or more in
  a file (not tests) and reports it at its first use. Annotations, f-string parts, dictionary keys,
  docstrings and bare strings, `Literal[...]` subscripts and translation calls are not counted.
- `generic-name` reports a file, a folder or a top-level class whose last word is `util`, `utils`,
  `helper`, `helpers`, `manager`, `common`, `misc` and the like; a class that extends a type with the
  same ending (`class SessionManager(CacheManager)`) is not reported.
- `hardcoded-secret` reports a secret-looking string (six characters or more with letters and
  digits, or three character classes) assigned to a name ending in `password`, `token`, `secret`,
  `api_key`, `credentials` and similar, also as a parameter default, keyword argument, dictionary
  entry or `os.getenv` fallback; `credential-shape` reports strings shaped like an AWS key, a GitHub
  or Slack token, a private key header, a URL with `user:password@` or a `Bearer` value anywhere;
  `secret-in-log` reports such a name passed to a logger call. Placeholders, environment variable
  names, header names and URLs are not secrets.
- `io-in-loop` reports an HTTP, database or repository call once per item of a `for`, `while` or
  comprehension; `asyncio.gather` over a comprehension, a paging loop (the condition reads a
  variable the body assigns) and a retry (a `try` in the loop that returns on success) are not.
- `todo-without-issue` reports `TODO`, `FIXME`, `XXX` and `HACK` as a whole word at the start of a
  comment or followed by `:` or `(`, not directly followed by `#123`, `PROJ-123` or a link. `TD` and
  `FIX` from ruff are not used, because they ask for an author and a date, which the TypeScript and
  Java presets do not.
- `ERA001` finds commented-out code by a heuristic: a comment that parses as a statement. Prose
  that happens to parse is reported too; reword it.
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
  `TRY300` and `TRY301` (`else` after `try`, `raise` inside `try`), `FBT003` (a boolean argument at
  the call site) and, for `PT`, `PT009` and `PT027` (`unittest` assertions, which `unittest`
  projects use by design). `PT011` and `PT030` ask for a `match` or a more specific class.
- The advice follows the project when two forms are valid. Pytest style: the parentheses of
  `@pytest.fixture` (`PT001`) and marks (`PT023`) and the shape of `parametrize` (`PT006`,
  `PT007`) are read from the project's `[tool.ruff.lint.flake8-pytest-style]` table (`pyproject.toml`,
  `ruff.toml`), and where it sets nothing from the majority of the project's own test code
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
  `python_functions`, `testpaths`, `norecursedirs`, and `--ignore`, `--ignore-glob`, `--deselect`
  and `-k` in `addopts`; a `collect_ignore` in `conftest.py` counts as well. It reports a test
  that pytest will not run and says why: a file that matches no `python_files` pattern, a file or
  folder excluded by `norecursedirs`, `--ignore` or `collect_ignore`, a class that matches no
  `python_classes` pattern or has an `__init__`, a function that matches no `python_functions`
  pattern, a test deselected by `--deselect` or `-k`. For `unittest` it reports a file named like
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
  that sleep. A poll is the allowed form, so a sleep is not reported in the body of a `while` loop
  of the same function, or of a `for` loop whose body leaves early under a condition (a `break` of
  that loop or a `return` inside an `if`, `try` or `match`, as in
  `for _ in range(50): if ready(): break`). A `for` loop that only repeats the wait, the `else` of
  a loop and a comprehension are reported, and so is `wait_for_timeout` in a loop, because
  Playwright's `expect` already polls. `real-clock-in-test` and `random-in-test` skip a
  file that uses `freezegun`, `time_machine`, a patched clock, a seed or a `random.Random(...)`, and
  look at the fake per test function, not per file. `network-in-test` skips files that use
  `responses`, `respx`, `requests_mock` and similar or patch the client, and tests under
  `integration`, `e2e` and the like. `tautological-assert` covers `assert True`, `assert x == x`,
  `assert 1`, `assertTrue(True)`, `assertEqual(x, x)`, `assertGreaterEqual(x, x)`,
  `assertIsInstance(x, object)` and the like: asserts that cannot fail.
- A test function with no assertion is not checked here; the conventions work owns it, together
  with the detection of the project's own assertion helpers.
- Touched code: a new finding is reported per site, and the rules in `touched-rules.mjs` (every
  `python-rules` id, and ruff's `BLE001`, `ERA001`, `PLR2004`, `PLW0602`, `PLW0603`, `S102`, `S307`,
  `S602`, `S604`, `S605`, `T201`, `T203`) are strict: a finding on a line the change adds or edits
  is new even when the base had a finding of the same rule in that file, so code that is touched
  is held to the rule while untouched legacy stays baselined. The repeats of one subject in a file
  are numbered `#2`, `#3`, so a new site never hides behind an old one.
- Deprecation: mypy runs with `--enable-error-code deprecated` when it is version 1.14 or later (the
  code does not exist before), and the generated pyright config sets `reportDeprecated` to
  `error`, so using an API marked `@deprecated` is a finding in each checker.

### Rules from code review

These carry over checks the TypeScript preset added from review findings, with the same decisions
where Python allows it. Each message names the allowed form and the `python.exceptions` entry that
lifts the rule for some paths. The per-file rules live in `languages/python/rules/review/`
and the project-wide ones, which resolve imports across files, in `review/project/`. The
TypeScript `nitpicker/no-fixed-sleep-synchronization` check is `sleep-in-test` above.
`singular-and-plural-field`, `exhaustive-enum-predicate` and `forwarding-wrapper` check production
sources only, never test files, as in TypeScript (its production scope) and Java (main sources); a
test helper that forwards, a fixture factory with `tag` and `tags`, or a test that compares a few
members is not reported.

- `restating-docstring` and `long-docstring` (TypeScript: the `no-comments` doc-comment checks).
  The Python preset does not ban comments or docstrings; only these two contents are checked, on
  the docstring of every function, method and class (not modules). A docstring restates the name
  when every word of its description, apart from the filler words of the TypeScript rule (`the`,
  `returns`, `function`, `method`, ...), is a word of the name or a plural, `-ed` or `-ing` form of
  one (`load_users`: "Returns the loaded user."), and nothing else in the docstring says more: a
  section, field or example with text keeps it. That last part differs from TypeScript on purpose:
  PEP 257 and pydocstyle ask every docstring for a summary line, so a docstring whose `Args:` or
  `Returns:` section carries the information cannot drop the summary that restates the name, and
  reporting it would leave no allowed form. The description ends at the first `:param`-style
  field, Google section (`Args:`, `Returns:`, `Raises:`, `Examples:`, ..., also a single-line one
  such as `Returns: the id`, `Raises ValueError: ...` or `Note: ...`) or numpy section (a title over
  a `---` line). A docstring whose description has more than 5 non-empty lines is reported with its
  count. As in TypeScript, bullet items and the body of a directive such as `.. note::` count; only
  code examples do not: a reST literal block after a line ending in `::`, the body of a code
  directive (`.. code-block::`, `.. code::`, `.. sourcecode::`, `.. doctest::`, `.. testcode::`,
  `.. testoutput::`), fenced code, and a doctest block (`>>>` lines up to the next blank line). The
  subject is the qualified name, so a growing docstring keeps its identity.
- `singular-and-plural-field` (TypeScript: `nitpicker/no-singular-and-plural-prop`): an optional
  `tag: T` beside an optional `tags` whose element type is `T` (`list`, `Sequence`, `set`,
  `frozenset`, `Iterable`, `tuple[T, ...]` and the `typing` names; `Optional`, `| None`,
  `NotRequired` and `Annotated` are looked through; `-es` and `-ies` plurals count). Optional means
  a default value in a `@dataclass`, attrs `@define` class, pydantic `BaseModel` or `BaseSettings`
  and `NamedTuple`, `total=False` or `NotRequired` in a `TypedDict`, and a default in a function's
  parameters. Unannotated parameters are not compared. Common irregular plurals of the last word
  count (`child`/`children`, `index`/`indices`, `person`/`people`, `sub_index`/`sub_indices`), and
  a string annotation (`tags: "list[str]"`) is read as the annotation it spells.
- `exhaustive-enum-predicate` (TypeScript: `nitpicker/exhaustive-union-predicate`): an `or` chain of
  `==` or `is`, an `and` chain of `!=` or `is not`, or an `in` / `not in` tuple, list or set, that
  compares one plain reference (`status`, `self.status`) with two or more distinct members of one project
  enum (a class of the project that derives from `Enum`, `IntEnum` or `StrEnum`, resolved through
  imports, with at least 3 members) or with values of a `Literal` alias the parameter is annotated
  with. Only a value is checked (a `return`, an assignment, a lambda body, also inside `not`, a
  conditional expression or another `and`/`or`), never an `if` or `while` condition, and not in a
  function that returns `TypeGuard` or `TypeIs`. Only a list of some of the members fails, as in
  the TypeScript and Java presets, because a member added later falls into the default silently; a
  list of every member is not reported. An alias (`DEFAULT = A`, or a second name with the value
  of an earlier member) is not a member of its own. Enums from libraries are not checked. The allowed form is a `match` with `case _:
assert_never(value)`, or an `if`/`elif` chain ending in `else: assert_never(value)`.
- `forwarding-wrapper` (TypeScript: `nitpicker/no-forwarding-wrapper`): an undecorated, non-async
  module-level function whose body (after a docstring) is `return target(...)` passing its own
  parameters in order (`*args` and `**kwargs` as spreads, keyword-only ones as `name=name`), where
  `target` is a single undecorated function of the project (same module, imported or reached
  through a module) with the same parameter names, annotations and defaults and the same return
  annotation. Unannotated functions, methods and library targets are not checked. The message says
  to call the target directly, or to import or bind it under the old name.
- `unused-option` (TypeScript: the same rule of the `structure` check): a parameter with a default
  of an undecorated module-level function in production code that no call passes, by keyword, by
  position, or through `*args` (positional parameters) or `**kwargs` (all). Calls are resolved
  through imports, aliases, module attributes and package re-exports (`from .pricing import total`
  in an `__init__.py`), using the module names the coupling check uses. A function nothing calls is
  not judged, nor one used as a value (passed, stored, decorating), one a star import exposes, one
  called from an `if __name__ == "__main__":` block or a `__main__.py`, or one an entry point
  names: `[project.scripts]`, `[project.gui-scripts]`, any `[project.entry-points.<group>]` and
  `[tool.poetry.scripts]` (read by `configuration/python-package.mjs`), the
  `[options.entry_points]` of `setup.cfg`, and the `entry_points` of a `setup()` call in `setup.py`
  when it is a literal or a module-level name bound to one (`project/entry_points.py` parses it
  with `ast` and never runs it). Tests do not count as callers,
  unless the project is a published package (a `[project]` or poetry `name`, a
  `[build-system] build-backend`, no `Private :: Do Not Upload` classifier and no
  `package-mode = false`): then its own tests count, as in the TypeScript preset. The subject is
  `function.parameter`, so the finding is new only when the change adds the parameter or removes
  its last caller.

A file with an expression too deep for Python's recursion limit (a sum of 900 terms) does not stop
the run: the checks that fail on it are skipped for that file and reported as a descriptive
`python-rules/rules-skipped` note that does not fail the gate. A file too deep for `ast.parse`
itself (a sum of tens of thousands of terms) gets the same note, saying every check skipped it.

### Slow tests

- **Rule.** `test-runtime/slow-test` (as for [Java](java-preset.md#slow-tests)) fails a pytest test
  the change adds or edits when it takes more than 5 s as a unit test, or more than 30 s as an
  integration test (`thresholds.unitTestSeconds` and `thresholds.integrationTestSeconds`).
  Integration tests are those under a folder named `integration`, `integration_tests`, `e2e` or `it`,
  in a file whose name has an `integration` or `e2e` part (`test_db_integration.py`), or marked
  `@pytest.mark.integration` or `@pytest.mark.e2e`. The message names the test
  (`tests/test_order.py::TestCart::test_empty`), the measured time and the budget, the fixes (no
  `time.sleep` or other fixed waits, a wider fixture scope for a costly fixture, or the
  `integration` marker if it is one) and the `python.exceptions` entry for `slow-test`.
- **Measurement.** Head only, from the same pytest run that measures coverage, with no extra run:
  nitpicker loads its own plugin (`-p nitpicker_pytest_report`, from
  `languages/python/adapters/test-results/`), which writes each test's time to a report. A test is
  charged its call and the setup and teardown of its function-scoped fixtures. A module, class,
  package or session fixture is timed on its own (its setup in `pytest_fixture_setup`, its teardown
  up to `pytest_fixture_post_finalizer`) and not charged, so the first test that uses a costly
  shared fixture, or the last one before it is torn down, is not slow because of it. A shared
  fixture that requests another one (`request.getfixturevalue`) is subtracted once, not twice. A parametrized
  test is one test, timed by its slowest case. `unittest` runs are not timed.
- **Coverage.** The times come from the coverage run, so they include coverage.py's tracing, which
  makes Python code roughly two to three times slower with branch coverage on. The budgets apply to
  that run. The Java and Kotlin presets do the same: their slow-test times come from the test tasks
  that run with the JaCoCo agent, whose overhead is smaller. The TypeScript preset has no slow-test
  rule.
- **Edited or added.** The plugin finds the test's function from its code object (its file and
  `__qualname__`, through `functools.wraps` wrappers), reads its line range with `ast` from the first
  decorator to `end_lineno`, and compares those lines, stripped and without blank ones, with the same
  function in the base file at the same path; the range comes from the parser, so a triple-quoted
  string with lines at column 0 inside the test is part of it. A test is counted when that text
  differs, the function is new, or the file is new. A test whose function is not found (a generated
  test, a function defined inside another function) is counted when its file changed. Slow tests the
  change does not touch stay baselined, and the base snapshot reports none. The finding is at the
  test's own file (the node id), with the `def` line when the function is defined there; a test a
  class inherits from a base class in another file has no line, and the message says where it is
  defined (`tests/test_child.py::TestChild::test_save (defined at tests/common.py:12)`).
- **Missing report.** When pytest ran tests but left no report (a test called `os._exit`, or a
  plugin stopped pytest before it finished), the run gets a `test-runtime/pytest-report-missing`
  tool error instead of passing unchecked. A `unittest` run writes no report and gets no error.

### New console output from tests

- **Rule.** `test-console-output` (as for [TypeScript](usage.md#console-output-from-tests)) fails a
  change when a pytest test prints a message the base run did not print. The usual cause is work
  that outlives a test or an error a handler now logs and swallows: a thread or task still running,
  a resource closed twice, a deprecated call. A message counts when it is written to standard error,
  logged at `WARNING` or above (through any logger; the exception's type and message are added for
  `logger.exception`), or raised as a warning (`DeprecationWarning: ...`). Standard output
  (`print`) never counts, and neither does a log record of a test that takes the `caplog` fixture,
  because that test asserts on its logs. A logger with its own handler on standard error is reported
  once, from standard error. A warning raised, or standard error printed, while pytest imports and
  collects a file is given to that file with no test name.
- **Matching.** The same as TypeScript, with the same code: a stderr traceback is one message
  without its frames and source lines, numbers, paths, times and ids are normalized, each message is
  reported once per test file, and a message that differs from a base message by one random-looking
  word matches it. `testConsole.allow` drops a third-party message the project cannot fix
  (`{ "contains": "old client is deprecated", "paths": ["tests/legacy/**"], "reason": "..." }`), and
  an `exceptions` entry for `test-console-output` lifts the rule for some test files, in the
  top-level `exceptions` as with TypeScript or in `python.exceptions` with the other Python rules.
  The message names `testConsole.allow` and the top-level route.
- **Measurement.** The pytest plugin of [slow tests](#slow-tests) records the messages in the run
  that measures coverage, on both snapshots. Standard error is read from pytest's capture. When the
  project turns capture off (`-s` or `--capture=no` in `addopts` or `PYTEST_ADDOPTS`), the plugin
  switches nitpicker's run back to `--capture=fd` before pytest starts capturing. That is safe for
  the run: nitpicker shows no live test output anyway, and the only change a test can notice is that
  reading standard input raises pytest's "reading from stdin while output is captured" error instead
  of reaching the end of input. `--capture=sys` and `tee-sys` are left as they are. `unittest` runs
  are not checked.

## Slice 1: tools, reports and identities

- **Lint: ruff.** `ruff check --config <report dir>/nitpicker-ruff.toml --ignore-noqa
--no-cache --output-format sarif`, where the toml is `languages/python/ruff/nitpicker-ruff.toml`
  without the codes the installed ruff lacks (`ruffConfigFor`). The rule set is nitpicker's, not
  the project's, so the gate means the same on every project: pyflakes (`F`), the error rules of
  pycodestyle that are not formatting (`E4`, `E7`, `E9`), bugbear (`B`), comprehensions (`C4`),
  `SIM`, `PIE`, `RET`, `PERF`, a list of the stable `RUF` rules (without `RUF001`, `RUF002`,
  `RUF003` and `RUF012`: non-ASCII text and mutable class attributes, both common in correct
  code) and `T20` (no `print`), without `B008` (a call in an argument default, which the web
  frameworks need). Slice 2 adds the shared one-way groups `G`, `N`, `ERA`, `ARG`, `PT`, `S`, `TRY`,
  `PLR2004` and `FBT`. The target version follows the project's
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
  that exist in the snapshot, test files left out of measurement (`test_*.py`, `*_test.py`,
  `tests.py`, `conftest.py`, `*/tests/*`, `*/test/*`, and `testing/*` at the project root), and a fixed `exclude_lines` of the idioms that cannot be
  tested (see Exceptions under slice 4). The project's own coverage configuration (`.coveragerc`, `setup.cfg`,
  `tox.ini`, `[tool.coverage]`) is not read, so its `exclude_lines`, `exclude_also`,
  `partial_branches`, `omit`, plugins and subprocess measurement are all dropped and the gate
  measures every project the same way. Exit status 5 (no tests collected) is accepted; any other
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
  the analyzer as tool (`python`, or `mutation` for `mutation-failed`) and path `.`, never a throw from the CLI: `ruff-failed`, `format-failed`, `tests-failed` (the project's own
  tests fail, the same rule the TypeScript preset uses), `coverage-failed`, `types-failed` and `rules-failed` (slice 2), `structure-failed`, `environment-failed`,
  `duplicates-failed`, `coupling-failed`, `import-linter-failed` (slice 5), `mutation-failed` (slice 6)
  and `python-failed` for anything unexpected. An environment that cannot be found at all (no
  `.venv` at the configured directory, no `uv sync`, poetry has none) is caught earlier, while the
  tool versions are read, and is reported as a plain tool error of each analyzer for each snapshot. Every failing step is reported, with the end of the tool output. The CLI
  exits 2 when nothing new failed, and a snapshot with a tool error is not compared, as for Java; the other analyzer is.
- **Not included.** Multi-project
  repositories are analyzed one project root at a time. Windows is untested (mutation testing
  needs WSL, see slice 6).

## Slice 3: structure limits and CRAP

- **File limits.** The shared file-limit rule (`shared/rules/file-limits.mjs`) checks every `.py`
  file outside dot, virtualenv (`venv`, `env`), build, `migrations` and `__pycache__` folders: 300 lines per module, 500 per test
  module (a test file as defined under the rules),
  120 characters per line, and 6 modules (and separately 6 test modules) directly in one folder, where an `__init__.py` is checked but not counted. A
  file or folder already over a limit fails only when it grows, and a folder moved to a new path is
  matched to its old path.
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
  skipped, as is a file too deeply nested for the parser (`RecursionError`, `MemoryError`); ruff's
  `E9` rules already report a syntax error. The four limit metrics and the cyclomatic complexity
  (the CRAP input) all come from this one script, like `StructureMetrics.java` for Java; no
  external tool is involved.
- **Definitions** (the TypeScript analyzer's, applied to Python syntax). Unit: every `def` and
  `async def` with a body, methods and nested functions alike; named `Outer.method` and
  `outer.inner`, the qualified names coverage.py uses. `lines`: last line - first line + 1, from the
  first decorator, without the docstring (it is documentation, like `statements`, so adding one to
  a long legacy function does not make it grow; TypeScript counts comments, Python has no comment
  node to leave out).
  `statements`: every statement in the body, compound statements counting once plus their bodies:
  `if`/`elif` (an `elif` is a nested `if` statement in the syntax tree, as `else if` is in
  TypeScript), `for`, `while`,
  `try`, `with`, `match`, `return`, `pass`, assignments, a nested `def` or `class` (but not its
  body); not counted: the docstring, `else`/`finally` themselves, `except` clauses and `case`
  clauses (only their bodies). `maxControlNesting`: the deepest nesting of `if`/`elif`, `for`,
  `async for`, `while`, `match` and `except`; `try`, `with` and comprehensions do not nest. An
  `if`/`elif`/`else` chain nests one level, like an `else if` chain in TypeScript and Java; an `elif`
  is the same level as the `if` it continues, and a statement nested in a branch is one level
  deeper. An `else:` block that holds an `if` is nested, as an `else { if }` block is in TypeScript and Java. The
  finding says so. A `match` is one level, whatever its number of `case` clauses; a statement in a
  `case` is one level deeper.
  `parameters`: positional-only, positional, keyword-only, `*args` and `**kwargs`, one each; the
  `/` and `*` markers are not parameters. The first positional parameter of a method (`self`,
  `cls`, or whatever it is called) is not counted, because the caller does not pass it: a function
  directly in a class body that is not a `@staticmethod`. Lambdas and comprehensions are part of
  the function that contains them; nested functions and methods of nested classes are units of
  their own and do not count towards the function around them.
- **Which files.** The `.py` files under the source roots (see `sourceRoots`), skipping hidden
  directories, `__pycache__`, `node_modules` and `site-packages`. When the source root is the whole
  project (`.`: no `src/` and no top-level package), the directories source root detection never
  treats as packages (`tests`, `test`, a top-level `testing`, `docs`, `doc`, `examples`, `scripts`, `build`, `dist`, `env`,
  `venv`; one list in `python-project.mjs`) and `conftest.py` are skipped too, so tests, build
  copies and virtualenvs are not gated. Node lists the files once per snapshot
  (`python-files.txt`) and hands the list to the metrics script. Tests are
  outside the default source roots, so they are not gated.
- **Findings.** Same as Java: `languages/python/adapters/analysis/python-structure.mjs` gives the metrics to
  `evaluateStructure` and keeps the enforceable limit findings (tool `structure`; the descriptive
  per-function metrics are not emitted). Identity: qualified name, occurrence among equal names in
  the file, and a hash of the function text with the common indentation removed, so moving or
  re-indenting a whole function keeps it baselined while changing the nesting of a statement inside
  it counts as an edit (Java trims every line, which would hide that in Python).
- **Cyclomatic complexity** (`complexity`, the CRAP input). Computed by the same script from the
  syntax tree, with no external tool: 1 plus one for each decision point in the function's own
  body. Decision points: `if` and `elif`, a conditional expression (`a if b else c`), `for` and
  `async for`, `while`, each `except` handler, each `case` of a `match` (a `case _:` without a
  guard is the `default` of a `switch` and does not count), each extra operand of `and` and `or`
  (`a and b and c` is two), and in a comprehension or generator expression each `for`/`async for`
  clause and each `if` clause. The decision points are the McCabe ones of the other presets
  (ESLint's `complexity` rule for TypeScript, the Java and Kotlin metrics programs all
  count `if`, loops, `case` but not `default`, `catch`, `&&`, `||` and `?:`), with two differences
  in scope: a lambda counts towards the function around it, as in Java and Kotlin but unlike
  TypeScript, which scores every arrow function and function expression on its own; and each `for`
  and `if` clause of a comprehension counts, which has no equivalent in the other languages.
  Not counted: `else`, `finally`, the `else` of a loop or a `try`, `with`, `assert`, `try` itself.
  Lambdas and comprehensions are part of the function around them; nested functions and the
  methods of nested classes have their own entry and do not count towards it. An
  `@overload` stub (however the decorator is spelled: `overload`, `typing.overload`, `t.overload`)
  gets no CRAP score, and neither does a function whose first body statement starts on the `def`
  line (`def f(): return 1`): its only statement shares a line with the definition, which
  runs when the module is imported, so its coverage cannot be told apart. The script writes `complexity`, `definition` (the `def` line, which differs from
  `start` when the function is decorated) and `bodyStart` (the line of the first body statement)
  next to the limit metrics, and the CRAP step reads them from `structure.json`; a failing
  structure step is the only failure, `structure-failed`, and CRAP then has nothing to score.
- **Coverage join.** `languages/python/ingest/crap.mjs` takes the per-function entries of the
  coverage.py JSON report PY1 already produces (`files.<path>.functions`, coverage.py 7.6 or newer)
  and joins each function to the entry with the same qualified name (`A.m`, `A.m.inner`, the
  names coverage.py reports) whose lines (`executed_lines`, `missing_lines`, `excluded_lines`) lie
  inside the range from the `def` line to the last line of the function. `start_line` is not used, because only recent coverage.py
  versions report it. Coverage of a function is the lower of its line and branch percentage, as for
  JaCoCo, and CRAP is `ccn^2 * (1 - coverage)^3 + ccn`, shared with Java
  (`ingestCrapRows` in `languages/java/ingest/crap.mjs`). A function with no statements and no
  branches counts as fully covered: a docstring-only stub, and a function whose lines coverage.py
  excludes (`# pragma: no cover`, `if TYPE_CHECKING:`, a multi-line `@overload` stub). Definitions
  that share a name in a scope (a `@property` getter and its `@x.setter`, `@singledispatch`
  registrations all named `_`, conditional definitions) collapse into one coverage.py entry, which
  keeps only the last one, so an entry is used only for the function whose lines lie inside it. Any
  other function is scored from the file's own per-line data (`executed_lines`, `missing_lines`,
  `executed_branches`, `missing_branches`) over its own line range: after its `def` line and
  without the lines of functions nested in it; a docstring-only definition therefore cannot lend
  its empty entry to a branchy one with the same name. A file coverage.py did not report (outside
  the source roots) has unknown coverage and fails with `crap-coverage-unknown`; nothing is
  guessed. `# pragma: no cover` keeps its coverage.py meaning (excluded lines are not statements).
  Identity: qualified name plus the same function-text hash, ratchet key the name, so an edited
  function over the limit fails only when its score rises.
- **Cache invalidation.** The metrics script, the new adapters, the shared structure and CRAP rule
  files and `shared/policy.mjs` are in the Python analyzer's configuration hash.
- **Tests.** `ingest/crap.test.mjs` (the join, on structure entries and a coverage.py report),
  `python-structure.test.mjs`, `python-crap.test.mjs`, `python-sources.test.mjs` (all with the fake
  toolchain) and `metrics/structure-metrics.test.mjs` (the script itself, on the real `python3`:
  the limit metrics, the nesting of `elif` chains and `match`, and each kind of decision point); `core/command/python/python-cli-*.test.mjs` drives the CLI
  in two runs: new structure, CRAP-score and unknown-coverage findings next to a touched legacy
  function that is held, then the legacy function grown under a raised `thresholds.crapLimit`; the
  gated e2e adds real branches for each (nested loops with four parameters, a legacy function
  edited and then grown, an untested branchy function).

## Slice 4: gate on changed branch coverage

- **Tool and report.** No new tool and no extra run: the coverage JSON of slice 1 already has, per
  file, the branch arcs coverage.py recorded, `executed_branches` and `missing_branches` as
  `[from line, to line]` pairs (a negative `to` leaves the enclosing function, class or module).
  The runner always turns branch coverage on, so both snapshots have them.
- **Findings.** `ingestCoverageBranches` (`languages/python/ingest/coverage-reports/coverage-branches.mjs`) groups the
  arcs by their `from` line and emits one enforceable `coverage-py` / `changed-branch-coverage`
  finding per line whose taken outcomes are below 95% (the minimum of the other languages). Lines
  without branches are never reported. The tool name is `coverage-py`, not `coverage`: `coverage`
  is also the name of the TypeScript coverage analyzer, whose identity scheme differs, and the
  touched-code rule in `shared/policy.mjs` (`TOUCHED_CODE_RULES`) is scoped by tool name.
- **What makes it "changed".** The same mechanism as Java slice 8: the differential comparison maps
  head lines to the merge base through the zero-context diff, and `TOUCHED_CODE_RULES` lists
  `coverage-py` for this rule, so an uncovered branch whose head line lies in a changed range, or in
  an added file, is new even if the base had it. An uncovered branch on an unchanged line stays
  baselined and does not fail.
- **Identity.** `branch-source:<16 hex>`, a hash of the line's source text (trimmed, whitespace
  collapsed), with `#2`, `#3` for identical lines in one enclosing scope, in order. The scope is the
  chain of `def` / `class` names found from the line's indentation (`Class.method`, empty at module
  level), so a new identical line in another function does not renumber a legacy gap. No line
  number, so inserting code above keeps the finding baselined and a renamed file follows the rename
  map. Moving a gap into another function, or renaming its function, makes a new identity, which
  matters only when the branch line itself is also changed.
  Editing the line changes both the identity and the changed range, so it is new.
- **Message.** `Branch coverage is 50.00%; minimum is 95%. Not taken: the branch to line 7. Test it,
or remove it if it can't happen. To exempt a file, add it to exclude in nitpicker.config.json.` It
  names where the untaken outcomes lead; those line numbers are only in the message, never in the
  identity.
- **Granularity and limits.** A line with several outcomes (`while`, `for`, `if`/`else` chains,
  `match` cases) is judged on all of them together. coverage.py does not track conditional
  expressions or `and`/`or` operands, nor the arms of `try`/`except`/`else`/`finally`, only jumps
  between lines, so those are not reported: an untested `except` handler is not gated by this rule.
  Reformatting a line counts as changing it. A file without readable source text is skipped.
  Coverage comes from the tests of the snapshot being analyzed, so adding or removing a
  test changes which branches are covered on head.
- **Exceptions.** `# pragma: no cover` and `# pragma: no branch` are not honored (the generated
  `exclude_lines` does not list them and `partial_branches` is empty), and the project's own
  coverage settings are ignored, so the one measurement is the same everywhere. Only idioms that are
  never testable are excluded, with the same list on every coverage.py version: `if TYPE_CHECKING:`
  (also `typing.TYPE_CHECKING`), `if __name__ == "__main__":`, `@overload` (also `typing.overload`)
  and `raise NotImplementedError`. Anything else that legitimately cannot be tested is lifted with
  `exclude` in `nitpicker.config.json` (a path glob), which drops every finding for that file, not
  only this rule's. Test files are not measured, so a `.` source root does not gate them.
- **Tests.** `languages/python/ingest/coverage-reports/coverage-branches.test.mjs` (the ingester on a recorded
  coverage.py report, identity stability, baselined / touched / added cases through
  `compareFindings`); `core/command/python/python-cli-*.test.mjs` (the CLI with fake tools); the gated e2e test adds
  six cases on a real project (moved gap baselined, edited line fails, edited and tested passes,
  new untested branch fails while the old gap stays baselined, a pragma hides nothing, new tested
  branch passes).

## Slice 5: duplicates, coupling and import contracts

All three read only the production sources under `python.sourceRoots`. A file is not production
code when it is `test_*.py`, `*_test.py`, `tests.py` or `conftest.py`, or sits under a directory
named `tests`, `test` (or a top-level `testing`), `migrations`, `build`, `dist`, `venv`, `site-packages`, `node_modules`, `__pycache__` or a
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
  blocks, which it marks `typeOnly` (the body of an `if TYPE_CHECKING:`, where the flag is `TYPE_CHECKING`
  imported from `typing` or `typing_extensions` (also under an alias or as `typing.TYPE_CHECKING`) or
  the module-level `TYPE_CHECKING = False` idiom, alone or in an `and` condition; any other
  `TYPE_CHECKING`, such as `foo.TYPE_CHECKING` or one imported from another module, is an ordinary name; its `else` branch is runtime code, and the `else` branch of `if not TYPE_CHECKING:` is type-only). Everything else is JavaScript (`python-coupling.mjs`) so it is unit-tested without Python:
  a module is a `.py` file named relative to its import root (`a/b.py` is `a.b`, `a/__init__.py` is
  `a`), a package is the module's containing package (a package's `__init__` belongs to the package
  itself, a top-level module to `(root)`), relative imports are resolved against the importing
  module, and an import is an edge to the longest module the sources define (`import a.b.c.Thing`
  links `a.b.c`; `from a import b` links `a.b` when that is a module, else `a`). An edge is type-only
  when every import that makes it is under `if TYPE_CHECKING:`. Type-only edges count in every
  metric (fan-in, fan-out, instability, package cohesion and the dependency count), but the
  enforceable `stability-direction` rule never reports one as the inverted dependency, so a stable
  package that imports an unstable one only for annotations is not an inversion. TypeScript
  applies the same rule to `import type` edges. Imports of anything
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
- **import-linter and `TYPE_CHECKING`.** import-linter counts imports under `if TYPE_CHECKING:` as
  imports unless the project's contract config sets `exclude_type_checking_imports = True` in its
  `[importlinter]` section. Nitpicker does not override the project's
  contracts, so set it there when type-only imports should not break a contract.
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
  `source_paths` is the source roots and `do_not_mutate` skips the test files (`tests/`, `test/`,
  a top-level `testing/`, `test_*.py`, `*_test.py`, `tests.py`, `conftest.py`) and the `exclude` globs, so an excluded file that mutmut
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
(a test file as defined under the rules). Anything else (a test, a dependency
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

| #   | Ticket                                                    | Slice                        | Tool and report                                                      | Findings                                                                                          | Status |
| --- | --------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| PY1 | [#168](https://github.com/jhonDoe15/nitpicker/issues/168) | Base runner and CLI          | ruff, ruff format or black, pytest or unittest under coverage.py     | lint and format findings, `line-coverage`, `uncovered-function`, `tool-error`                     | done   |
| PY2 | [#169](https://github.com/jhonDoe15/nitpicker/issues/169) | Type checking, one-way rules | mypy or pyright; ruff rules and import rules for the one allowed way | type errors; one-way rules with their failure messages; the Python skill                          | done   |
| PY3 | [#170](https://github.com/jhonDoe15/nitpicker/issues/170) | Structure limits and CRAP    | `ast` metrics script and complexity, joined with the coverage report | `function-*-limit` rules as for TypeScript and Java; `crap-score-limit`, `crap-coverage-unknown`  | done   |
| PY4 | [#171](https://github.com/jhonDoe15/nitpicker/issues/171) | Changed-branch coverage      | the coverage JSON branch data and the changed lines from git         | `changed-branch-coverage`                                                                         | done   |
| PY5 | [#172](https://github.com/jhonDoe15/nitpicker/issues/172) | Duplicates and coupling      | jscpd with the `python` format; import graph for stability           | `duplicate-clone`, `duplicate-clone-size`; `stability-direction`; import-linter `contract-broken` | done   |
| PY6 | [#173](https://github.com/jhonDoe15/nitpicker/issues/173) | Mutation testing             | mutmut 3 run data, per docs/mutation-testing                         | `mutant-survived`, `mutant-nocoverage` (new surviving mutants fail)                               | done   |

Slice order follows what each one needs: PY2 to PY6 all reuse PY1's environment detection and
snapshot handling, PY3 and PY4 reuse its coverage report, and PY6 is last because it is the
slowest and needs the tests to pass reliably under the environment PY1 established. The custom
rules each slice adds are listed in [`spec/checks.md`](../spec/checks.md) (generated from
`shared/policy.mjs`) when they become enforced for Python; PY1 adds none, PY3 adds the six structure
and CRAP rules.

## Tests

- `core/command/python/python-cli-*.test.mjs`: fast, always on. The CLI end to end with a fake toolchain
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
  its own `[tool.mutmut]` runs without a `-n 0` workaround. A change that adds a test sleeping past
  a lowered `unitTestSeconds` and two tests that log a warning or print to standard error fails
  `slow-test`, `sleep-in-test` and `test-console-output`, and passes once `python.exceptions`,
  `testConsole.allow` and a top-level exception lift them.
- Slice 2: `languages/python/rules/rule-hints.test.mjs` (always on) checks that every rule has a
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
  the one-way rules and `python.exceptions` end to end; `languages/python/adapters/e2e/` holds the
  basedpyright e2e (a configured and a weakened `[tool.basedpyright]` table) and the `if TYPE_CHECKING:`
  one (no stability inversion, import-linter still sees it), which share `helpers.mjs` with the preset e2e.
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
