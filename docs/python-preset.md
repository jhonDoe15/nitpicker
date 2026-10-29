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
which tools a project uses, so the preset detects the tools a project already has (uv, poetry,
pipenv, hatch, conda or a plain virtualenv; ruff or black; pytest, unittest, Django's `manage.py test` or nose2) and never makes adoption depend on switching.

## How it works

```
node languages/python/adapters/python-runner.mjs --part python     (analyzer python, per snapshot)
  -> ruff check  --config nitpicker-ruff.toml      -> ruff.sarif
  -> ruff format --check --diff | black --check    -> format.txt
  -> coverage run -m pytest | unittest | nose2, or manage.py test -> coverage.json (coverage.py JSON)
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
- **Ingesters.** The generic ingesters live in `shared/ingest/` and are shared with the Gradle
  presets: `sarif.mjs` (ruff, with `prepareSarif`), `format-check.mjs` (the format check), `common.mjs` and
  `lizard-crap.mjs`.
  The one new ingester is `languages/python/ingest/coverage-reports/coverage-json.mjs` for the coverage.py JSON
  report. The legacy-inventory and `exclude` handling is `applyFindingPolicy` in
  `shared/findings/finding-policy.mjs` and Java's `configureJavaAnalyzer`, which are language-neutral and
  take the tool name for a `baseline-expansion` finding as an option.

## The project's own environment

The tools run inside the environment the project already has, detected in this order (the first
that applies wins):

| Order | Detected by                                                   | The tools run as                                                                                                                                               |
| ----- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | `python.environment` is set                                   | `uv`, `poetry`, `pipenv`, `hatch`, `conda` or `path` as named; any other value is a virtualenv directory, inside the project or absolute                       |
| 1     | `uv.lock`                                                     | `uv run --project <checkout> --no-sync -- <tool>`; needs `uv sync` to have run (or `UV_PROJECT_ENVIRONMENT`)                                                   |
| 2     | `poetry.lock`                                                 | the virtualenv `poetry env info --path` reports, first on `PATH`; needs `poetry install` to have run                                                           |
| 3     | a uv workspace root above                                     | as 1: an ancestor with a `uv.lock` and a `[tool.uv.workspace]` table; its `.venv` is the environment                                                           |
| 4     | a `Pipfile` or `Pipfile.lock`                                 | the virtualenv `pipenv --venv` reports, first on `PATH`; needs `pipenv install --dev` to have run                                                              |
| 5     | `[tool.hatch.envs...]` in `pyproject.toml`, or a `hatch.toml` | the environment `hatch env find` reports (the default one), first on `PATH`; needs `hatch env create`                                                          |
| 6     | an `environment.yml` or `environment.yaml`                    | the `prefix:` it declares, else the environment `conda env list` finds under its `name:`; tools run by their path in that environment, with `CONDA_PREFIX` set |
| 7     | a `.venv/` directory                                          | `.venv/bin` first on `PATH`, `VIRTUAL_ENV` set                                                                                                                 |
| 8     | nothing                                                       | `ruff`, `black`, `coverage`, `mypy`, `pyright`, `basedpyright` and `python3` from the `PATH`                                                                   |

An activated conda environment of a project without an `environment.yml` is already served by the
last row: its `bin` is first on the `PATH`. For pipenv, hatch and conda found by detection, a missing manager command is not an error: the
detection goes on with the next row, because the tools may be on the `PATH` (a CI job that installed
them with `pip`). When the manager runs and has no environment for the project, or the setting names
it and it is not installed, the run stops with an `environment-failed` error that says how to create
it and how to install the manager (`uv`, `poetry`, `pipenv`, `hatch`, `conda`).

The environment of the head is always the one of the live checkout (the head work tree you run
`nitpicker` in). It is never created or synced by nitpicker: the uv environment is checked before
`uv run --no-sync` is called, so a missing `.venv` is an error and not an empty environment created
in your checkout. The base snapshot gets an environment of its own only when its dependency files
differ from the head's (next section).
A virtualenv outside the project (a shared `/opt/venv`, an activated CI environment) is used with
an absolute `python.environment`. A tool that is
not installed in the environment but is on the `PATH` (typically `ruff`, which many projects use
from `pipx` or `uvx`) is used from the `PATH`. `coverage` and the test runner (pytest, Django or
nose2) must be in the environment, since the runner imports the project's code and dependencies;
the error says so.

### The base snapshot and its environment

The base side is a separate git work tree of the merge base, and it has no virtualenv. Running the
live checkout's environment there would normally import the wrong code: the project is usually
installed into the environment in editable mode, which points at the live checkout, so the base
tests would silently exercise head code (and fail, or worse, pass for the wrong reason).

Decision: **prepend the snapshot's own import roots to `PYTHONPATH`** for every tool run, the same
way for base and head. The import root of a source root is the directory itself for a `src/`
layout, and its parent for a flat package. `PYTHONPATH` entries come before `site-packages` and
before the `.pth` files and import hooks editable installs use, so the snapshot's sources win.
Tests run with the snapshot as working directory (a Django project's from the directory of its
`manage.py`), so `tests/`, `tests.py` and `conftest.py` are the snapshot's too, and coverage only measures the snapshot's source roots.

When the change touches the dependencies, the base would still import head's packages, so the base
snapshot gets its own environment. nitpicker compares the dependency files of the base snapshot
with the head's: `uv.lock`, `poetry.lock`, `pdm.lock`, `Pipfile`, `Pipfile.lock`, the
`requirements*.txt` and `constraints*.txt` files at the root and the `*.txt` files of a
`requirements/` folder (byte for byte), and the dependency tables of `pyproject.toml`
(`project.dependencies`, `optional-dependencies`, `requires-python`, `dependency-groups`,
`build-system`, `tool.poetry` dependencies, groups and extras, `tool.uv`, `tool.pdm`
dev-dependencies and resolution; any other setting is ignored). If nothing differs, the base uses the head's
environment, as above. If something differs, the project's own tool builds `.venv` inside the
snapshot, which is deleted with it, and the base tools run from it:

| The base snapshot has | Command run in the snapshot                                                                                  | Skips                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `uv.lock`             | `uv sync --frozen --no-install-project --no-install-workspace`                                               | the project and its workspace members                                    |
| `poetry.lock`         | `poetry install --no-root --no-interaction`                                                                  | the project                                                              |
| `pdm.lock`            | `pdm sync --no-self`                                                                                         | the project                                                              |
| `Pipfile.lock`        | `pipenv sync --dev`                                                                                          | refused when the lock has editable or path packages                      |
| `requirements*.txt`   | `python3 -m venv .venv`, then `.venv/bin/python -m pip install --prefer-binary -r <copy> [-c <constraints>]` | `-e`, paths, `file:` URLs, includes and constraints outside the snapshot |

`python.environment` picks the tool when it is `uv`, `poetry` or `pipenv`; with it unset the first
lock file in the order above wins, and requirements files are used when no lock file is there and
the project declares no pipenv, hatch or conda environment. `path`, `hatch`, `conda`, a directory and an
absolute path keep the head's environment for the base, because those are environments nitpicker
cannot rebuild from files. The commands never run the base's own setup code: the project itself is
not installed, and the requirements copy drops editable and local entries. The packages the
lock file lists are installed as the tool would install them, so their own build steps run.
If the install fails, or the tool is not installed, the run stops with an `environment-failed`
error that names the command and how to install the tool. A tool that the project's dev
dependencies provide (`ruff`, `mypy`, `pytest`) runs in the base at the version the base locks, so
a change that upgrades one of them compares the new version's findings against the old version's.

Limits: compiled extension modules of the project itself that are built into the environment are
not rebuilt for base; and a project whose code does not live under the detected source roots must
set `python.sourceRoots`.

## Configuration

Config keys with this preset: `base`, `disable` (the analyzer names are `python` and `mutation`), `analyzers`, the keys shared by all languages,
`thresholds` (`crapLimit`, enforced from slice 3, the file limits `fileLines`, `testFileLines`,
`lineLength` and `folderFiles`, the size limits `folderDepth`, `classMethods`, `classFields` and
`inheritanceDepth`, and the test time limits `unitTestSeconds` and `integrationTestSeconds`), `exclude` (findings under the globs are dropped) and
`legacyInventory` (same format and `baseline-expansion` rule as for Java), `history` (the opt-in
[change history](usage.md#change-history) check), and the `python` object below. `layout` takes
only `featureRoots`, and only once `history.coChange` is on (it names the feature folders
`co-change` reads); its other keys and `testConsole` stay a config error with this preset until it
runs the rules that read them (`shared-used-by-one-feature`, `test-console-output`). The
top-level `exceptions` is accepted only for the rules shared with the other languages: the file and size limits
(`file-lines-limit`, `line-length-limit`, `folder-files-limit`, `slow-test`, `folder-depth-limit`,
`class-methods-limit`, `class-fields-limit`, `inheritance-depth-limit`), the function rules
(`function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`,
`function-parameters-limit`, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`,
`mutant-survived`, `mutant-nocoverage`, which take `function` to name one function), whose messages
name it, the [dependency and repository checks](usage.md#dependency-and-repository-checks), and
`co-change` of the [change history](usage.md#change-history) check (with a `<module>/**` glob); the
Python equivalent of `exceptions` for every other rule is `python.exceptions`. Each list rejects the
other's rules (a function or file rule in `python.exceptions`, or a ruff code in `exceptions`, is a
config error that names the right list). `python` is an error with any other preset.

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

| Key            | Values                                                             | Default                                                                              |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `environment`  | `uv`, `poetry`, `pipenv`, `hatch`, `conda`, `path`, or a directory | detected, see above                                                                  |
| `formatter`    | `ruff`, `black`                                                    | `black` if the project declares it (see below) and not ruff's formatter, else `ruff` |
| `testRunner`   | `pytest`, `unittest`, `django`, `nose2`                            | `pytest` if the project uses it (see below), else `unittest`                         |
| `typeChecker`  | `mypy`, `pyright`, `basedpyright`                                  | detected from the project, see below                                                 |
| `importLinter` | `true`, `false`                                                    | run when the project has an import-linter config (see slice 5), else not             |
| `sourceRoots`  | non-empty array of project directories                             | `src`, else the top-level packages (directories with `__init__.py`), else `.`        |
| `entryPoints`  | array of project-relative globs                                    | none; see [Composition roots](#the-shared-one-way-rules)                             |
| `exceptions`   | array of `{ rule, paths, reason }`                                 | none; see [Exceptions](#exceptions)                                                  |

`python.entryPoints` lists the files that start the program, such as a job runner or a worker that
reads its settings from the environment (see the composition roots below). Adding a file there
loosens `process-env-access`, so the policy-change list reports it as a loosening and a removal as
a change, like `layout.entryPoints`; the base snapshot is measured with the entry points both
sides declare.

The policy-change list also reads the project's own pytest and mutmut settings, because they shrink
what the gate measures: `testpaths` that stop collecting a test file and an added `--ignore` or
`--ignore-glob` in `addopts`, both counted only for files pytest collects (`python_files`), and a
`do_not_mutate` pattern that covers production code are loosening. `-k`, `-m` and `--deselect` are
not, because the run strips them and `uncollected-tests` reports the tests they hide (`languages/python/adapters/configuration/pytest/test-selection.mjs`). A hidden
module that production code imports (`from legacy import feature`, followed through other hidden
modules and parent packages) fails even under an established `exclude`. Changed `.py` files outside
`python.sourceRoots` are named in a notice that never fails the run.

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
`nitpicker.config.json` (the top-level `exceptions` for the function, file and size rules, below),
the same shape as in every preset: `rule` (the id printed in the finding, for example `T201`, `PTH118`, `frozen-dataclass`,
`return-value`, `reportReturnType`), `paths` (a non-empty array of globs relative to the project)
and `reason` (required text). It lifts that rule for those paths, in the base and in the head
snapshot alike, and every exception is listed in the report's config overrides. The id is checked
when the config loads: a ruff code (or a prefix such as `PTH`, which covers every `PTH` code), a
`python-rules` id, a mypy error code or a pyright or basedpyright `report*` rule; a typo such as `T210` is a config
error, not a silent no-op. Prefer fixing the code; an exception is for code that is
legitimately outside the rule, such as a command line entry point that prints or a module that
must keep a mutable dataclass.

**Per-function exceptions.** The function size limits, CRAP and changed-branch coverage take an
optional `function` in an entry of the top-level `exceptions`: the name the finding prints
(`Service.run`, `outer.inner`), matched exactly. For `changed-branch-coverage` it is required, and the entry accepts the uncovered
branches inside that function only, so the rest of the file keeps every other check; a branch in no
function (module level) can only be lifted with `exclude`. The branch is attributed to the narrowest
function of `structure.json` that holds its line. Branch coverage is enforced by default; this is
the escape hatch for a branch that cannot be tested. A `function` on any other rule is a config
error.

`exclude` is the other way out: it drops every finding under the globs, and the paths are not
handed to ruff or black either. The rules most likely to flag code that is right for its place are
`T201` (`print` in a command-line tool or a notebook), `PERF203` (`try` in a loop that must handle
each item) and `F401` (an `__init__.py` that re-exports): lift them for the path with
`python.exceptions`, or `exclude` the path, for example
`"exclude": ["src/demo/cli.py", "**/__init__.py"]`. The project's own ruff configuration
(`[tool.ruff]`, `ruff.toml`) is not read for linting, and of the coverage configuration only the
settings that say how the tests run are kept (see the test step below), so the result means the
same on every project; there is no override key for them.

The formatter is `black` when `pyproject.toml`, `setup.cfg`, `tox.ini`, `Pipfile`,
`.pre-commit-config.yaml` or a requirements file (`requirements*.txt`, `requirements/*.txt`) has a
`[tool.black]` table, `black` as a dependency (a requirements line, a poetry key or an entry of any
TOML dependency array), a `tox` command, or the `psf/black` or `black-pre-commit-mirror` repository
or the `black` hook id, and none of them configures ruff's formatter (`[tool.ruff.format]`, a
`[format]` table in `ruff.toml`, the `ruff-format` hook).

**The format check follows the project's code, not its formatter config.** A project whose
`[tool.ruff]`, `ruff.toml` or `[tool.black]` set the line length, quote style or indentation is
checked with the settings nitpicker measures from the code (below), which may differ from that
config, until the project opts in. By default `ruff format` runs with `--isolated` and always gets
`--target-version`, `--line-length`, `--config 'format.quote-style = "..."'` and
`--config 'indent-width = N'` (or `--config 'format.indent-style = "tab"'`); `black` runs with
`--config` pointing at an empty file nitpicker writes and the same options as flags
(`--line-length`, `--skip-string-normalization` for single quotes, `--target-version`). The values
are `python.quotes` (double), `python.lineLength` (88) and `python.indentation` (4) when the code
has no clear majority; `python.indentation` is `4`, `2` or `tab` (ruff only).

The project's scope still applies without the opt-in, so a generated file the project excludes gets
no format finding: `exclude`, `extend-exclude` and `force-exclude` of the ruff or black config are
forwarded (patterns are resolved against the config file that sets them, and nitpicker's own
`python.exclude` is added), and so is the target version (`target-version` or, for black, `target-version`
and `project.requires-python` of the nearest `pyproject.toml`), so both formatters infer the same
target. The keys that change how code is formatted but that nitpicker does not measure
(`skip-magic-trailing-comma`, `line-ending`, `docstring-code-format`, `preview`) are dropped and take
effect only with the opt-in.

The run prints, once at the start, the command that formats the code the way nitpicker checks it
(for example `Format with ruff: ruff format --isolated --target-version py38 --line-length 88 --config 'format.quote-style = "double"' --config 'indent-width = 4' .`;
black prints `<empty file>` for the config it writes), and one line when a project config is
ignored: `Ignoring [tool.ruff] in pyproject.toml; opt in with "tools": { "ruff": { "precedence":
["project", "nitpicker"] } }`. Each format finding refers to the command and names
`python.formatter` (when detected), the setting that changes the formatter.

**Opt-in.** `"tools": { "ruff": { "precedence": ["project", "nitpicker"] } }` (or `black`) reads the
project's own config: `.ruff.toml`, then `ruff.toml`, then `pyproject.toml`, the first found from
the project root up to the repository root, following `extend` (for black, the nearest
`pyproject.toml`, where black stops searching, with or without a `[tool.black]` table). A key the
config sets wins, and a pin in `nitpicker.config.json` that it overrides is named in the conventions
line; the measured or pinned convention fills the rest. `["nitpicker", "project"]` lets the
conventions win instead for ruff; it is a config error for black, whose flags cannot switch string
normalization back on. Listing `"project"` with no config file is a tool error that says to create it
or remove `"project"` from `tools.<tool>.precedence`. The file is read from the head checkout for
both sides of the comparison and passed to the formatter as `--config <file>`; the whole `extend`
chain and the located files are part of the cache key. The line length that the conventions take from the config is read from the merge base in a comparison (its parent-folder configs and `extend`ed files included; the branch's own config only when the base has no Python sources), so a pull request cannot raise its own limit by editing the config. The format command then passes the followed value (`--line-length`, the quote style of ruff, indentation) wherever the head config says another one, and the printed command shows it. Which formatter applies which convention:
ruff format applies all three; black applies `python.lineLength` and `python.quotes` (it keeps single
quotes as written, so it accepts both styles) and has no indentation option, so `python.indentation`
is neither measured nor printed with black, and pinning it is a config error. A file votes a line
length only from a call or bracket that the formatter left wrapped without a trailing comma (joined,
it would have fit any wider limit), or 120 when two lines pass 100. The run prints the source of each
convention: the files it measured, the pin in `nitpicker.config.json`, or "from your ruff config".

The test runner is the first of these the project shows it uses:

1. `pytest`: a `[tool.pytest.ini_options]`, `[pytest]` or `[tool:pytest]` section, `pytest.ini`, or
   `pytest` or a pytest plugin (`pytest-django` too) as a dependency or tox command.
2. `django`: a `manage.py` next to a Django dependency, or a `manage.py` that imports `django`,
   at the project root or in a direct subdirectory (`backend/manage.py`), which the tests then run
   from. mutmut names modules by their path from the project root, so in the subdirectory case
   mutation testing is skipped with a descriptive `mutation-skipped` finding
   (`django-subdirectory`); run nitpicker in that directory to mutate the project.
3. `nose2`: a `nose2.cfg`, a `unittest.cfg` whose `[unittest]` section lists `plugins`, or `nose2`
   as a dependency or tox command.
4. `pytest`: a `conftest.py`, or test files with top-level `def test_` functions, `import pytest` or
   `Test` classes without a base.
5. `unittest` otherwise.

It is decided from the project, not from what the environment can import, so an environment
without the runner is an error (`environment-failed`, naming `python.testRunner`) and not a silent
run of `unittest` that finds none of the tests (or, for Django, fails them all without the
project's settings). `python.testRunner` overrides the detection.

| Runner     | Tests run as                                             | Coverage and CRAP need | Mutation testing needs                   |
| ---------- | -------------------------------------------------------- | ---------------------- | ---------------------------------------- |
| `pytest`   | `coverage run -m pytest -q`                              | coverage, pytest       | mutmut, pytest                           |
| `unittest` | `coverage run -m unittest discover`                      | coverage               | mutmut, pytest                           |
| `django`   | `coverage run manage.py test --noinput`                  | coverage, Django       | mutmut, pytest, pytest-django and Django |
| `nose2`    | `coverage run -m nose2` (its own config picks the tests) | coverage, nose2        | mutmut, pytest                           |

mutmut 3 runs every suite with pytest (see slice 6), which also runs `unittest.TestCase` classes and
nose2's test functions; Django's test cases need the pytest-django plugin, and the settings module
is taken from `manage.py` (an `os.environ.setdefault("DJANGO_SETTINGS_MODULE", ...)` call or an
`os.environ["DJANGO_SETTINGS_MODULE"] = ...` assignment, commented-out lines skipped) unless a
pytest section (`[pytest]`, `[tool:pytest]`, `[tool.pytest.ini_options]`) names one.

## Slice 2: type checking and the one-way rules

The purpose of this slice is the "one way" for each construct. Every finding message names the
allowed form, and, because any rule can flag legitimate code, ends with how to add the exception.
Every enforceable finding of ruff, the type checkers, the rules, coverage, duplicates, coupling, import-linter, the dependency checks, the test times and mutmut ends with the one exception sentence (`If this is intended, add {"rule":"<rule>","paths":["<path>"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.`), except mypy `unused-ignore` (delete the comment), `no-import-outside-roots` (whose way out is `python.sourceRoots`), findings on `.`, the shared file and size limits and the function rules (the function limits, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`, `mutant-survived`, `mutant-nocoverage`), whose message names the top-level `exceptions` entry, with `function` for the function rules, instead. The allowed forms live in `languages/python/rules/hints/` and the route in one place, `exceptionSentence` in `languages/python/rules/rule-hints.mjs`, which assembles them and applies them to both analyzers' findings with `applyRuleHints`; `languages/python/rules/exception-sentences.test.mjs` fails on any other Python file that writes a route of its own, and a test checks that each rule's message
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
  the repository root. The config files, the `extends` chain included, are part of the cache key.
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
  folder, `test_*.py`, `*_test.py`, and the Django names in a Django project, see
  [runner parity](#runner-parity)): ruff's `ARG`, `FBT`, `PLR2004` and `S` findings in them are
  dropped after ruff runs (`rules/filters/ruff-allowed-forms.mjs`). Security findings (ruff `S` and the
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

| Allowed form                                   | Banned form                                                                  | Rule                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `pathlib.Path`                                 | `os.path`, `open()`, `os.getcwd()`, ...                                      | ruff `PTH*`                                                |
| f-strings                                      | `"...".format()`, `"..." % x`, `"".join` of a fixed list                     | ruff `UP031`, `UP032`, `FLY002`                            |
| `None` default, value built in the function    | a mutable default argument                                                   | ruff `B006`                                                |
| catch and handle a specific error, or re-raise | bare `except:`, `except Exception:`                                          | ruff `E722`, `BLE001`                                      |
| re-raise, return a failure value or a default  | `except X:` that only passes, continues, logs, returns or assigns a constant | `swallowed-exception`                                      |
| `contextlib.suppress(SpecificError)`           | `contextlib.suppress(Exception)`, `BaseException` or no argument             | `blind-suppress`                                           |
| explicit imports                               | `from module import *`                                                       | ruff `F403`                                                |
| `logging` (or the project's structlog, loguru) | `print`, `pprint`                                                            | ruff `T201`, `T203`                                        |
| log the caught exception itself                | logging only `str(error)` or an f-string with it in an `except`              | `catch-log-without-exception`                              |
| a test that asserts                            | a test function with no assertion                                            | `test-without-assertion`                                   |
| `@dataclass(frozen=True)`                      | `@dataclass` without `frozen=True`, outside tests                            | `frozen-dataclass`                                         |
| the validation library in `adapters/` only     | importing pydantic (or the declared library) elsewhere                       | `pydantic-boundary`                                        |
| an `enum.Enum` / `StrEnum`                     | a plain class of two string constants, or three `X_*`                        | `enum-string-constants`                                    |
| fixing the code                                | `# type: ignore`, `# noqa`, `# pyright: ignore`, ...                         | `no-inline-suppression`                                    |
| annotated code the checkers read               | `@no_type_check`, `if not TYPE_CHECKING:`, a stub beside                     | `no-type-check`, `not-type-checking`, `stub-beside-source` |

Details that are decisions rather than the table:

- `frozen-dataclass` and `pydantic-boundary` do not apply to test files (a `tests` or `test`
  directory, `test_*.py`, `*_test.py`, `tests.py`, `conftest.py`), where fakes mutate and tests exercise the
  adapters. `frozen=True` must be the literal `True`.
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
  `cancellation-not-propagated` instead, see [Cancellation propagation](#cancellation-propagation)): every
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

### The shared one-way rules

These rules bring the Python preset to the rules the TypeScript and Java presets enforce. Each
finding names the allowed form first and ends with the usual exception sentence (`python.exceptions`, or `exceptions` for the shared rules). The
rules marked "script" are `python-rules` findings of `nitpicker_rules.py` (one module per concern
under `languages/python/rules/`: `checks`, `boundary`, `smells`, `honesty`, `concurrency`); the others are ruff
rules. Rules that are not enforced because they flag idiomatic code with no clean alternative
are listed at the end.

| Concern                  | Allowed form                                                                                                                                     | Rule                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logging                  | `logger.info("Loaded %s", count)`, `logger.warning`, `logger.exception` (structlog, loguru: see below)                                           | ruff `G001`-`G004`, `G010`, `G101`, `G201`, `G202`, `TRY400`, `TRY401`                                                                               |
| Environment              | read once in a composition root, pass values in                                                                                                  | `process-env-access` (script)                                                                                                                        |
| Shell                    | a list: `subprocess.run(["git", "status"], check=True)`                                                                                          | `shell-command` (script), ruff `S602`, `S604`, `S605`, `S609`                                                                                        |
| SQL                      | parameters: `cursor.execute("select * from t where id = %s", (id,))`; placeholder lists, fixed lookups, `Literal`/`Enum` names, `sql.Identifier` | `sql-string-formatting` (script), ruff `S610`, `S611`                                                                                                |
| Path traversal           | `target = (base / name).resolve()`, then `target.is_relative_to(base)`                                                                           | `unsafe-path-join` (script)                                                                                                                          |
| Magic numbers            | a named constant                                                                                                                                 | ruff `PLR2004`                                                                                                                                       |
| Naming                   | PEP 8: `CapWords`, `snake_case`, `UPPER_SNAKE_CASE`, `...Error`                                                                                  | ruff `N`                                                                                                                                             |
| Boundary                 | parse untrusted data once with the project's validator (pydantic by default) in `adapters/`                                                      | `handwritten-boundary-guard` (script)                                                                                                                |
| Types in the domain      | real types, `Protocol`, frozen dataclasses                                                                                                       | `any-in-domain`, `pydantic-any-field`, `pydantic-extra-allow` (script)                                                                               |
| Pure domain              | clock, ids and random values passed in; ports implemented in `adapters/`                                                                         | `clock-now`, `random-in-domain`, `io-in-domain` (script)                                                                                             |
| Module state             | state in an object made in the composition root                                                                                                  | `module-level-mutable-state` (script), ruff `PLW0602`, `PLW0603`                                                                                     |
| Updates across `await`   | `delta = await fetch()`, then `self.total += delta`, or one lock around the whole update                                                         | `atomic-update-across-await` (script)                                                                                                                |
| Risky APIs               | JSON instead of pickle or marshal, `copy.deepcopy` to clone, a specific exception class                                                          | ruff `S301`, `S302`, `TRY002`, `TRY004`, `TRY201`, `TRY203`                                                                                          |
| Deserialization          | `yaml.safe_load`, `torch.load(path, weights_only=True)`, `numpy.load` without `allow_pickle`                                                     | ruff `S506`, `unsafe-deserialization` (script)                                                                                                       |
| Deprecated APIs          | the replacement the deprecation notice names                                                                                                     | mypy `deprecated`, pyright and basedpyright `reportDeprecated`                                                                                       |
| Repeated strings         | a constant or enum member                                                                                                                        | `repeated-string-literal` (script)                                                                                                                   |
| Unused arguments         | remove the argument, or prefix it with `_` when the signature is fixed                                                                           | ruff `ARG001`-`ARG005`                                                                                                                               |
| Generic names            | a name for the job (`price_rounding.py`, `OrderRepository`)                                                                                      | `generic-name` (script)                                                                                                                              |
| Secrets                  | read from the environment; log only that a secret is set                                                                                         | `hardcoded-secret`, `credential-shape`, `secret-in-log` (script)                                                                                     |
| Boolean flags            | keyword-only (`def send(message, *, urgent=False)`) or two functions                                                                             | ruff `FBT001`, `FBT002`                                                                                                                              |
| Input or output per item | one batch call, or `asyncio.gather`                                                                                                              | `io-in-loop` (script)                                                                                                                                |
| Task lifetimes           | open the resource around the whole task group, or inside the child; await the task first                                                         | `task-outlives-resource` (script)                                                                                                                    |
| Trio/AnyIO cleanup       | `with trio.CancelScope(deadline=trio.current_time() + 5, shield=True): await resource.aclose()`                                                  | `unshielded-cleanup-await` (script)                                                                                                                  |
| Task markers             | `# TODO(#123): ...` with an issue                                                                                                                | `todo-without-issue` (script)                                                                                                                        |
| Commented-out code       | delete it                                                                                                                                        | ruff `ERA001`                                                                                                                                        |
| Security sinks           | parameterized queries, `sha256`, verified TLS, a timeout, `yaml.safe_load`, `defusedxml`                                                         | ruff `S` (see below)                                                                                                                                 |
| TLS                      | verification on in every environment; a CA bundle (`verify=ca_path`, `cafile=`, `tlsCAFile=`)                                                    | ruff `S501`, `S323`, `tls-verification-off` (script)                                                                                                 |
| Signatures               | `hmac.new(key, message, hashlib.sha256)`; HMAC-SHA1 where a protocol fixes it                                                                    | ruff `S324`, `S303`, `weak-hmac` (script)                                                                                                            |
| Timeouts                 | `timeout=10` on every request, `urlopen` and plain `requests.Session` call; never `timeout=None`                                                 | ruff `S113`, `http-without-timeout` (script)                                                                                                         |
| Test honesty             | a reason on every skip, no sleeping, no tautologies, fixed time and seeded random values, no network                                             | ruff `PT`, `skipped-test-without-reason`, `sleep-in-test`, `tautological-assert`, `real-clock-in-test`, `random-in-test`, `network-in-test` (script) |
| Test layout              | tests in files pytest collects; helpers in the tests folder                                                                                      | `uncollected-tests`, `test-helper-in-source` (script)                                                                                                |

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
- `clock-now`, `random-in-domain`, `io-in-domain` and `any-in-domain` apply to a directory named
  `domain` anywhere in the path (not tests). `io-in-domain` reports `open`, `input`, `time.sleep`,
  `os.system` and imports of `subprocess`, `socket`, `requests`, `httpx`, `urllib.request`,
  database and cloud clients and similar.
- `module-level-mutable-state` reports a module-level `dict`, `list`, `set` or `collections`
  container that a function changes (item assignment, `del`, `append`, `update`, ...), once, at its
  definition; a collection that is only read, a local of the same name and a module-level change
  are fine. `PLW0603` covers rebinding with `global`.
- `atomic-update-across-await` reports a lost update in an `async def`: an assignment or augmented
  assignment to shared state whose value reads that same state before an `await` in the same
  statement (`self.total += await fetch()`, `self.total = self.total + await fetch()`,
  `self.total = await fetch(self.total)`, `cache[key] = cache[key] + await load()`,
  `self.counts[key] = self.counts.get(key, 0) + await load()`), or that uses a local saved from the
  state before an earlier `await` (`current = self.total`, `delta = await fetch()`,
  `self.total = current + delta`). Shared state is an attribute chain or subscript rooted at the
  method's `self` or `cls` (also from a nested function), at a module-level name (a dict, an
  object, a class), or a bare name declared `global` or `nonlocal`. awaiting into a local first, a local, a parameter object, in-place mutation (`self.items.append(await fetch())`), a
  read after the `await` (`self.total = await fetch() + self.total`), a check then set
  (`if key not in self.items: self.items[key] = await fetch()`) and a saved value restored after
  the location was deliberately set (save `self.state`, set it, `await`, put the saved value back) pass. An update inside `async with` on a lock that admits one task at a time passes: a name
  assigned in the same file (import aliases followed) from `asyncio.Lock` or `Condition`, `anyio.Lock` or
  `Condition`, `trio.Lock`, `StrictFIFOLock` or `Condition`, or from a semaphore or capacity limiter
  built with one slot (`asyncio.Semaphore()`, `asyncio.Semaphore(1)`, `BoundedSemaphore(value=1)`,
  `anyio.Semaphore(1)`, `anyio.CapacityLimiter(1)`, the `trio` equivalents), or a name not assigned
  there that contains `lock` or `mutex`. A semaphore or limiter with more than one slot, or a size the
  file does not state as the literal `1`, lets two updates interleave and is reported, whatever its
  name; so is a lock built in the `async with` itself (`async with asyncio.Lock():`), which no other
  task shares. A read saved before the lock was taken is still stale. Source and test
  files are checked. Differences from the TypeScript `require-atomic-updates`: it follows `self`
  and `cls`, it does not treat a parameter object as shared, it needs the same location to be read
  (`req.user = await verify(req.headers.token)` is not a finding) and it ignores a lazy
  initialization. Not covered: a local alias of shared state (`state = self.state`, then an update of `state.total`), `yield`, an `await` hidden in a helper the statement calls, and a lock taken by
  hand (`await lock.acquire()`); lift a serialized path with a `python.exceptions` entry. On a module
  dict the line also gets `module-level-mutable-state`, which asks where the state lives; the two
  findings are different failures and both apply. No ruff rule covers this hazard (checked against ruff 0.16.9). Run over the 215 files with `await` in the standard library and the installed `anyio`, `httpx`, `httpcore`,
  `mcp`, `starlette` and `uvicorn` packages it reported nothing, which measures false positives
  only.
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
  message says which one to fix. `sleep-in-test` ignores
  `asyncio.sleep(0)` and tests that patch the sleep or freeze the clock; it also follows the
  project's own helpers that call `time.sleep`. `real-clock-in-test` and `random-in-test` skip a
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

### Cancellation propagation

`python-rules/cancellation-not-propagated` rejects an explicit cancellation handler with a modeled
path that returns, breaks, continues, falls through, or raises a different error. Cleanup and
logging do not replace propagation: use a bare `raise`, or re-raise the unchanged caught exception
(`raise error`, including `error.with_traceback(...)`). Returning a failure result containing the
error or chaining a different exception still consumes the cancellation signal.

The owned AST check recognizes imported `asyncio.CancelledError` (including
`asyncio.exceptions.CancelledError`), `trio.Cancelled` and `anyio.get_cancelled_exc_class()` in
handler types, including import aliases, tuples, and names bound once by a plain assignment
(`E = asyncio.CancelledError`, `cancelled = anyio.get_cancelled_exc_class()`). Shadowed imports and
local modules with those names are not assumed to be backend APIs. `concurrent.futures.CancelledError`
is a different class from `asyncio.CancelledError` (since Python 3.8) and is not matched. Only
handlers lexically inside an `async def` are checked: a plain function or a done-callback
(`def done(fut): try: fut.result() except CancelledError: return`) keeps the `swallowed-exception`
behavior it had before, and so does a handler in an `except*` block. Source files, tests and entry
points use the same rule; generated/excluded files follow the existing source policy. A matching
handler receives this finding instead of a duplicate `swallowed-exception` or
`catch-log-without-exception` finding. Ordinary errors retain their existing handling policy. The
same rule applies to `contextlib.suppress(...)` with a cancellation class in `async def`, which
consumes the cancellation exactly like an empty handler (subject `suppress(asyncio.CancelledError)`).

Backend boundaries remain explicit. Raising a fresh asyncio `CancelledError` preserves its
cancellation signal and is allowed; this does not establish preservation of its payload. Trio and
AnyIO handlers should re-raise the original cancellation. Normal exits from `move_on_after`,
`CancelScope` or `asyncio.timeout` are intentional scoped boundaries and are not handlers targeted
by this rule. Deliberate asyncio suppression with `Task.uncancel()` is not inferred from a method
name: review that boundary with a `python.exceptions` entry for `cancellation-not-propagated`,
paths and a reason. No inline suppression is added.

The path model covers straight-line handlers, `if` branches (including literal constant branches),
`for`, `async for` and `while` loops (with `break`, `continue` and `else`), `match` statements and
`try/finally` completion overrides. A loop that can end without running a `raise` leaves a falling
path, and a `break` or `continue` that leaves the handler itself consumes the cancellation. A
`match` without a catch-all case, a nested `try/except`, `except*` and a `with` around a `raise`
(a context manager can suppress it) may or may not fall through: the statements after them are
still analysed, so a later `return` or `raise ValueError()` is reported, while a handler that ends
there is not reported on that evidence alone and a later `raise` is accepted. The check does not
resolve arbitrary helper implementations, `NoReturn` annotations, runtime monkey patches, broad
`BaseException` handlers or exception groups. It is a focused source guard, not a proof of
cancellation safety. Ordinary calls are assumed able to return; helper-based propagation should
re-raise explicitly in the handler or use a reviewed exception. A handler that deliberately
translates a cancellation it started itself (a hand-written timeout, or a deferred re-raise after
a loop) also needs that reviewed exception.

Awaiting a task this function cancelled is the documented way to wait for a child to stop, and the
`CancelledError` it raises belongs to the child. A `try` (or a `with contextlib.suppress(...)`)
whose body only awaits tasks, each cancelled earlier by a statement that always runs before it in
the same function, is therefore accepted when every caught type is an asyncio cancellation and the
handler body is quiet (`pass`, `...`, a bare `return` or a log call). The awaited task is a name or
attribute chain (`await task`, `result = await self._task`), or `asyncio.gather(...)` of such
names or of `*tasks` after `for t in tasks: t.cancel()`; the cancel is `name.cancel()` as a
statement of an enclosing block, not inside an `if`, and the name must not be rebound in between.
Such a handler is skipped entirely, so no `swallowed-exception`, `catch-log-without-exception` or
other handler check applies to it. A handler that does more (`return 5`, `raise RuntimeError()`),
a mixed tuple such as `(asyncio.CancelledError, Exception)`, or an await of anything else is still
reported. This asyncio-only allowance cannot tell the child's cancellation from one aimed at the
current task; Trio and AnyIO handlers have no such allowance.

Ruff **0.16.8** (pinned for the Python end-to-end suite in `.github/python-e2e-constraints.txt`;
0.16.9 was checked as well) has no ASYNC102, ASYNC103, ASYNC104 or ASYNC111; its `ASYNC` family
contains only the codes listed in `ruff rule --all`, none of which checks cancellation propagation,
so nothing is duplicated by the Ruff `ASYNC` selection. Two other Ruff rules can fire on the same
handler for a different reason and keep their own identity: `TRY203` (a handler that only
re-raises is pointless) and `B904` (`raise ValueError()` inside an `except` without `from`). The
documented flake8-async ASYNC103/104 behaviors motivated this narrower owned check; no flake8-async
dependency or source implementation is used. Existing AST parsing, findings, line-independent
identities, configuration hashing and path exceptions supply the integration. Regression fixtures
execute actual asyncio task cancellation and statically exercise the explicit Trio/AnyIO forms;
they do not establish measured precision over a real-project corpus or execute those third-party
backends.

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
directory>` or `test-runs/unittest_timings.py <report> discover` (unittest's own `discover`, with
  `-s tests` or `-s test` when that directory exists and `-t .` when it is a package, through a
  `TextTestRunner` whose result records each test's time and writes the JUnit report),
  `manage.py test --noinput` (the project's own settings, from `manage.py`, run from the directory
  `manage.py` is in) or `-m nose2`, then `coverage json`. The project's pytest configuration keeps
  working: `--no-cov` and `-n0` are added only when pytest-cov or xdist is installed, so
  `--cov=pkg` or `-n 2` in `addopts` cannot replace the outer coverage run or fork it away, and
  `--lf` or `--sw` find their cache in the report directory. The coverage settings are nitpicker's,
  written to the report directory: branch coverage on, `parallel` off, `source` the source roots
  that exist in the snapshot, test files left out of measurement (`test_*.py`, `*_test.py`,
  `tests.py`, `conftest.py`, `*/tests/*`, `*/test/*`), and a fixed `exclude_lines` of the idioms that
  cannot be tested (see Exceptions under slice 4). From the project's own coverage configuration
  (the first of `.coveragerc`, `setup.cfg` `[coverage:run]`, `tox.ini` `[coverage:run]` and
  `[tool.coverage.run]` that has coverage settings, the order coverage.py reads them in) the run
  settings that decide what code gets measured at all are kept: `concurrency` (multiprocessing,
  gevent, eventlet, ...), `patch` (subprocesses), `plugins`, and the `omit` of the run and of the
  report section (where projects often list `migrations/*`), added to the test files. Lists may run
  over several lines with comments and blank lines in between, as coverage.py reads them; relative
  `omit` patterns and the `source` paths are made absolute, so they match whatever directory the
  tests run from.
  When they make coverage.py write one data file per process, the files are combined before the
  report. Its `exclude_lines`, `exclude_also`, `partial_branches`, `branch` and `source` are
  dropped, so the gate judges every project's code the same way. Test files are not scored for
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
  the analyzer as tool (`python`, or `mutation` for `mutation-failed`) and path `.`, never a throw from the CLI: `ruff-failed`, `format-failed`, `tests-failed` (the test run
  exited 1 without naming a failing test; failing tests themselves are the `tests/tests-failed`
  error of [Runner parity](#runner-parity), which keeps the other findings), `coverage-failed`, `types-failed` and `rules-failed` (slice 2), `structure-failed`, `environment-failed`,
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
  module (`test_*.py`, `*_test.py`, `tests.py`, `conftest.py`, or anything under a `test` or `tests` folder),
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
  one the change pushes over it, fails as usual. Exceptions are the usual ones: an
  `exceptions` entry for the rule (optionally with `function`, see below), `exclude` in
  `nitpicker.config.json` for a path, or the legacy inventory; there is no inline disable. Each
  message ends with the entry that accepts it, for example
  `{"rule":"function-lines-limit","paths":["src/demo/a.py"],"function":"Service.run","reason":"..."}`;
  the shared rules append it.
- **Structure metrics (decision to review).** `languages/python/metrics/structure_metrics.py` parses
  the source files with the standard library `ast` module (parse only, nothing is imported or run)
  and writes one object per function to `structure.json`. It is run by the project's own Python
  (`python <script> <output> <project> <file list>`), so it needs no dependency and no pin, and it
  parses with the grammar of the interpreter the project uses; a file that does not parse is
  skipped, since ruff's `E9` rules already report a syntax error; a file too deeply nested for the
  parser (`RecursionError`, `MemoryError`) stops the run with a `structure-failed` tool error that
  names the file, as an unparsable TypeScript file does, because no other tool reports it and
  skipping it would leave it outside the structure gate unnoticed. The four limit metrics and the cyclomatic complexity
  (the CRAP input) all come from this one script, like `StructureMetrics.java` for Java; no
  external tool is involved.
- **Definitions** (the TypeScript analyzer's, applied to Python syntax). Unit: every `def` and
  `async def` with a body, methods and nested functions alike, and every `lambda`; named
  `Outer.method` and `outer.inner`, the qualified names coverage.py uses. A lambda is named after the
  scope that holds it and the name it is assigned to (`pipeline.score` for `score = lambda v: ...`,
  also with an annotation), else `<lambda>` (`pipeline.<lambda>`; a lambda in a default argument, a
  decorator or a base class belongs to the scope around that `def` or `class`); repeated names are
  numbered by the source, as for the `<init>` blocks of Kotlin. `lines`: last line - first line + 1, from the
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
  directly in a class body that is not a `@staticmethod`. A lambda has `statements` 1 (its
  expression), `maxControlNesting` 0 and the parameters of its signature. Comprehensions are part of
  the function that contains them; lambdas, nested functions and methods of nested classes are
  units of their own and do not count towards the function around them (`lines` is the physical
  span, so the lines of a nested unit still count towards the function around it, as in
  TypeScript).
- **Which files.** The `.py` files under the source roots (see `sourceRoots`), skipping hidden
  directories, `__pycache__`, `node_modules` and `site-packages`. When the source root is the whole
  project (`.`: no `src/` and no top-level package), the directories source root detection never
  treats as packages (`tests`, `test`, `docs`, `doc`, `examples`, `scripts`, `build`, `dist`, `env`,
  `venv`; one list in `python-project.mjs`) and `conftest.py` are skipped too, so tests, build
  copies and virtualenvs are not gated. Node lists the files once per snapshot
  (`python-files.txt`) and hands the list to the metrics script. Tests are
  outside the default source roots, so they are not gated.
- **Findings.** Same as Java: `languages/python/adapters/analysis/python-structure.mjs` gives the metrics to
  `evaluateStructure` and keeps the enforceable limit findings (tool `structure`; the descriptive
  per-function metrics are not emitted). Identity: qualified name, occurrence among the functions of that name and the same text
  that are over the same limit (so a property getter and setter, or a function defined in two
  branches, do not renumber each other when another of that name is added above; the CRAP identity
  numbers the same way, and so do the TypeScript structure and CRAP findings), and a hash of the function text with the common indentation removed, so moving or
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
  in scope: a lambda is a unit of its own, as every lambda, arrow function and anonymous function is
  in the other presets, and does not count towards the function around it; and each `for`
  and `if` clause of a comprehension counts, which has no equivalent in the other languages.
  Not counted: `else`, `finally`, the `else` of a loop or a `try`, `with`, `assert`, `try` itself.
  Comprehensions are part of the function around them; lambdas, nested functions and the
  methods of nested classes have their own entry and do not count towards it. An
  `@overload` stub (however the decorator is spelled: `overload`, `typing.overload`, `t.overload`)
  gets no CRAP score, and neither does a function whose first body statement starts on the `def`
  line (`def f(): return 1`): its only statement shares a line with the definition, which
  runs when the module is imported, so its coverage cannot be told apart. The script writes `complexity`, `definition` (the `def` line, which differs from
  `start` when the function is decorated) and `bodyStart` (the line of the first body statement)
  next to the limit metrics, and a lambda entry also carries `lambda: true` and `statementLine` (the first
  line of the statement that holds it, which is the line coverage.py reports for it). The CRAP step reads
  them from `structure.json`; a failing
  structure step is the only failure, `structure-failed`, and CRAP then has nothing to score.
- **Coverage join.** `languages/python/ingest/crap.mjs` takes the per-function entries of the
  coverage.py JSON report PY1 already produces (`files.<path>.functions`, coverage.py 7.6 or newer)
  and joins each function to the entry with the same qualified name (`A.m`, `A.m.inner`, the
  names coverage.py reports) whose lines (`executed_lines`, `missing_lines`, `excluded_lines`) lie
  inside the range from the `def` line to the last line of the function. `start_line` is not used, because only recent coverage.py
  versions report it. Coverage of a function is the lower of its line and branch percentage, as for
  JaCoCo, and CRAP is `ccn^2 * (1 - coverage)^3 + ccn`, shared with Java
  (`ingestCrapRows` in `shared/ingest/lizard-crap.mjs`). A function with no statements and no
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
  A lambda has no coverage.py entry and no line of its own: its body runs on the line of the statement
  that creates it, so coverage.py cannot tell a lambda that was never called from one that was. A
  lambda therefore counts as fully covered when that statement ran (`statementLine` of its entry is
  not in `missing_lines`) and as not covered when it did not, whatever its size; a lambda in a
  statement that ran is scored by its complexity alone, so only a lambda with 9 or more decisions
  fails, with the message for a covered function. This is the most coverage.py can tell, and the
  statement that never ran is already a finding of its own function. Lambdas of the same name in one
  file are numbered by their source text, as the `<init>` blocks of Kotlin are.
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
or remove it if it can't happen. If this is intended, add
{"rule":"changed-branch-coverage","paths":["src/demo/a.py"],"function":"value","reason":"..."} to
"exceptions" in nitpicker.config.json.`
  It names where the untaken outcomes lead (those line numbers are only in the message, never in the
  identity) and the entry that accepts the branch for its function; a branch in no function points at
  `exclude` instead.

- **Granularity and limits.** A line with several outcomes (`while`, `for`, `if`/`else` chains,
  `match` cases) is judged on all of them together. coverage.py does not track conditional
  expressions or `and`/`or` operands, nor the arms of `try`/`except`/`else`/`finally`, only jumps
  between lines, so those are not reported: an untested `except` handler is not gated by this rule.
  Reformatting a line counts as changing it. A file without readable source text is skipped.
  Coverage comes from the tests of the snapshot being analyzed, so adding or removing a
  test changes which branches are covered on head.
- **Exceptions.** `# pragma: no cover` and `# pragma: no branch` are not honored (the generated
  `exclude_lines` does not list them and `partial_branches` is empty), and the project's own
  report settings are ignored, so the one measurement is the same everywhere. Only idioms that are
  never testable are excluded, with the same list on every coverage.py version: `if TYPE_CHECKING:`
  (also `typing.TYPE_CHECKING`), `if __name__ == "__main__":`, `@overload` (also `typing.overload`)
  and `raise NotImplementedError`. A branch of a function that legitimately cannot be tested is
  accepted with an `exceptions` entry for `changed-branch-coverage` that names the function
  (`"function": "Service.wide"`), which keeps every other finding of the file. Only a branch in no
  function (module-level code) is lifted with `exclude` in `nitpicker.config.json` (a path glob),
  which drops every finding for that file, not only this rule's. Test files are not measured, so a `.` source root does not gate them.
- **Tests.** `languages/python/ingest/coverage-reports/coverage-branches.test.mjs` (the ingester on a recorded
  coverage.py report, identity stability, baselined / touched / added cases through
  `compareFindings`); `core/command/python/python-cli-*.test.mjs` (the CLI with fake tools); the gated e2e test adds
  six cases on a real project (moved gap baselined, edited line fails, edited and tested passes,
  new untested branch fails while the old gap stays baselined, a pragma hides nothing, new tested
  branch passes).

## Slice 5: duplicates, coupling and import contracts

All three read only the production sources under `python.sourceRoots`. A file is not production
code when it is `test_*.py`, `*_test.py`, `tests.py` or `conftest.py`, or sits under a directory named `tests`,
`test`, `migrations`, `build`, `dist`, `venv`, `site-packages`, `node_modules`, `__pycache__` or a
hidden one such as `.venv`; the same list feeds jscpd's `--ignore`, the import scan and the module
list. Only the duplicate scan can be changed: `duplicates.skippedFolders` replaces `tests`, `test`,
`migrations`, `build` and `dist` there (the other names and the test file patterns always apply),
so a package really called `build` can be scanned for clones. When the source root is `.` (a flat project without packages, or `python.sourceRoots`
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
  (`importsOnly` in `core/tooling/jscpd/import-only/`, the same check the other languages use for
  their import lines); a clone that also carries code is still reported. The finding is on the first
  file of the pair, and its message names both files and tells to add either one to `exclude` when
  the repetition is intended. An `exclude` glob or a `python.exceptions` entry for `duplicate-clone`
  that matches either file of the pair lifts the finding. A source root of `.` is supported.
  A second jscpd run (100 tokens, 5 lines, `jscpd-renamed-config.json`) goes over a normalized copy
  of the project's Python files, where names, strings, numbers and comments are one token each,
  imports, `__all__` and literal-only lists, dicts and tuples are blanked and generated files are left
  out, so a copy with renamed locals and changed literals is found: `duplicate-clone` with an
  identity starting `renamed:`, the same message, lifted by the same `exclude` glob or
  `python.exceptions` entry. It replaces a plain jscpd clone over the same two ranges and drops
  clones made of class, field and enum member declarations only, and clones that only repeat one or
  two statements (mapper calls, `add_argument` lists); dicts keyed by qualified names
  (`Status.NEW: "new"`) are data. Findings are mapped back to the original lines
  because the copy keeps every line break.
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
  depend on an abstraction in a more stable package, and ends with the `python.exceptions` entry for that
  file, for when the inversion is intended. An edge can appear without anyone touching it, because package
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
  on a file end with the `python.exceptions` sentence for `contract-broken`. A run that checked no
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
  analyzer and only when it had no tool error other than failing tests, a skipped dependency check
  or a test time error (`toleratedDependencyErrors` of the analyzer: `tests`, `dependencies`,
  `test-runtime`). When mutmut's first run fails on the project's tests ("failed to collect
  stats", "Failed to run clean test"), nitpicker runs pytest once with a JUnit report and the
  options and Django settings mutmut's pytest gets (below), and runs
  mutmut again with `--ignore=<module>` in `PYTEST_ADDOPTS` for each failing or uncollectable test
  module, the Python counterpart of PIT's `--excludedTestClasses`; the `tests/tests-failed` error
  names those modules. When no test module is left, the run is a `mutmut/tests-failed-skipped`
  tool error instead. A project environment on Python before 3.10, which mutmut 3 does not
  support, gets one `mutmut/tool-skipped` tool error and nothing else of this analyzer. The
  pinned `PYTEST_ADDOPTS` of [Runner parity](#runner-parity) apply here too. When pytest-xdist is installed the run gets
  `PYTEST_ADDOPTS=-n0` (merged after any value the environment already has), because mutmut runs
  pytest itself and cannot collect which tests cover which function under `-n`. When the runner is
  not pytest, `-o python_files=test*.py` is added the same way, the test file pattern of unittest,
  Django and nose2, so pytest collects a `tests.py` or `testcalc.py` it would skip by default. The snapshot is a
  disposable work tree; mutmut writes its `mutants/` directory into it. On head the directory is
  removed afterwards. On base it stays, because head reads its results (see below). Keep `mutants/`
  out of version control in your project, like `.venv/`. When pytest collects no test in mutmut's
  copy of the project ("runner returned 5") the run has no results, and that is a descriptive
  `mutation-skipped` finding (`no-tests-collected`) naming the file pattern and `also_copy`, never
  an empty result.
- **Configuration.** mutmut reads `[tool.mutmut]` in `pyproject.toml` (or `[mutmut]` in
  `setup.cfg`). nitpicker always writes its own `[tool.mutmut]` into the snapshot's `pyproject.toml`
  (never into your checkout; it creates the file if the project has none, and a table the project
  had is removed from the snapshot's copy, so that file is the one thing besides `mutants/` the
  preset writes into the snapshot): `source_paths` is the source roots and `do_not_mutate` skips the
  test files (`tests/`, `test_*.py`, `*_test.py`, `conftest.py`, and `tests.py`, `tests_*.py` and
  `*_tests.py` in a Django project) and the `exclude` globs, so an
  excluded file that mutmut cannot parse (a Python 2 leftover) does not fail the run. From the
  project's table only what the run needs is kept: `also_copy`, the process isolation options
  (`process_isolation`, `forkserver_warmup`, `preload_modules_file`, `max_forkserver_restarts`,
  `use_setproctitle`) and, when the source roots are `.`, its `source_paths` (or the old
  `paths_to_mutate`). `do_not_mutate`, `only_mutate`, `mutate_only_covered_lines`,
  `max_stack_depth`, `pytest_add_cli_args` and the rest are ignored, since they can shrink the
  mutation testing; when the project's table holds any of them the run prints
  `Ignoring [tool.mutmut] in pyproject.toml except also_copy and its process options; opt in with ...`.
  The table is written with a TOML serializer, and a `pyproject.toml` that cannot be parsed is a
  tool error that names the file.
  Source roots of `.` with no `source_paths` of the project are an error, since mutmut would copy
  the whole project: set `python.sourceRoots` or `[tool.mutmut]`. A test that reads a file outside
  the copied sources fails mutmut's first run ("failed to collect stats"); the error then adds a
  line to list the file under `also_copy` in `[tool.mutmut]`.
  With `"tools": { "mutmut": { "precedence": ["project", "nitpicker"] } }` every key of the
  project's table (or `setup.cfg` section, with its values typed) overrides nitpicker's, except that
  the test patterns and the `exclude` globs stay in `do_not_mutate` (the project's own `do_not_mutate`
  patterns still count as `mutant-ignored`, listed or not); `["nitpicker", "project"]` is the
  unlisted behavior. A project listed without a table is a tool error.
- **Equivalent mutants.** mutmut also mutates strings and logging, so some survivors cannot be
  killed by any test. The ways out are an `exceptions` entry for `mutant-survived` or
  `mutant-nocoverage` (with `function` to name one function; the message prints the entry), a
  `python.exceptions` entry for `mutant-ignored` (below) with the path, or `exclude` (the mutants of
  the file are dropped).
- **Code hidden from mutmut.** Like a Stryker disable comment in the TypeScript preset, what hides
  production code from mutmut is an enforceable `mutmut/mutant-ignored` finding
  (`languages/python/adapters/mutation/mutation-markers.mjs`): each `# pragma: no mutate`
  (also its `block`, `start`, `end`, `class` and `function` forms) at its line, each production
  file a `do_not_mutate` pattern of the project's own `[tool.mutmut]` (or setup.cfg `[mutmut]`)
  matches, and `mutate_only_covered_lines = true` on the config file. The comment or pattern is not
  an exception route; the finding's `python.exceptions` sentence for `mutant-ignored` is. The
  project's own table is read whether or not `tools.mutmut` opts it in, before nitpicker writes
  its table.
- **pytest.** mutmut 3 runs the suite with pytest, which also runs `unittest.TestCase` classes and
  plain test functions; nose2's own test kinds (generators, layers, parameterized tests) do not run
  under pytest, so their mutants are reported as not covered. Every project therefore needs pytest
  installed for mutation testing, whatever runner coverage.py uses; without it the `mutation`
  analyzer fails with a `mutation-failed` error that says to install it. A Django project also
  needs pytest-django: without it mutmut is not run and a descriptive `mutation-skipped` finding
  (`pytest-django`) says so; with it `DJANGO_SETTINGS_MODULE` is taken from `manage.py` unless the
  environment or the pytest configuration sets it. Whenever pytest-django is installed (a pytest
  project that uses it too), `-o django_find_project=false` keeps it from putting the real project
  (where `manage.py` is) ahead of mutmut's copy on `sys.path`, which would test the unmutated code.
  Whether pytest-django is installed is part of the cache key for every runner, since the option
  applies to all of them.
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
(`tests/`, `test/`, `test_*.py`, `*_test.py`, `tests.py`, `conftest.py`). Anything else (a test, a dependency
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

## Runner parity

What the Python preset does the way the TypeScript and Java presets do (`parity/python-runner`).

- **Failing tests.** pytest runs with `--junitxml` (xunit1, so each case has its file and line) and
  `--continue-on-collection-errors`; exit status 1 with failing cases is no longer a failure of
  the analyzer. The static analyzers run as usual, coverage and CRAP come from the tests that ran,
  and the failing tests are one `tests/tests-failed` tool error per snapshot, listing up to 20 test
  ids, as Java's `tests/tests-failed` (`test-runs/test-failures.mjs`). unittest failures are read
  from its `FAIL:`/`ERROR:` lines. A run that exits 1 without naming a test stays
  `python/tests-failed`.
- **Slow tests.** `slow-test` (tool `test-runtime`; `test-runtime/slow-test` is accepted in
  `exceptions` as the same rule), as for Java, Kotlin and TypeScript, for pytest and unittest
  projects alike: a test the change adds or edits over 5 s, or 30 s for an integration test, from
  the JUnit times (`test-runs/slow-tests.mjs`). The message is the shared one
  (`shared/rules/slow-tests/`): the budget, the measured time, the fixes (patch the clock, fake
  network, database and disk) with the way to move it to an integration test, and the top-level
  `exceptions` entry that lifts it, `{ "rule": "slow-test", "paths": ["tests/db/**"], "reason":
"..." }`, not `python.exceptions`. Only passed tests are timed (a failed, errored or skipped case
  is left out). A parametrized test counts its slowest case over that case's own budget. A test is
  its decorators, its signature and its body, read by logical line (`test-runs/python-blocks.mjs`:
  brackets, strings and continuations, so a wrapped signature or decorator is one line), in the
  file and at the line where it is defined, inside the classes that enclose it. It counts as edited
  when the base file has no identical block in the same classes; a block that is only in a base
  test file the change removed or renamed counts as moved, so a test copied next to an original
  that still exists is new. An inherited test (a mixin or base class in another module, as the
  usual unittest and Django way to share tests) is also counted when the class that collects it is
  new or its `class` line changed; a test built by a factory (`test_import = make_case(6)`) when a
  line that names it is new or changed. pytest runs through `test-runs/pytest_timings.py`, which
  times the call phase (`junit_duration_report=call`) plus the setup of function-scoped fixtures
  (`setup_method` is one), so a session, module or class fixture's setup (`setup_class` too) is
  not charged to the first test that uses it, and records each case's marks; unittest times each
  test from `startTest` to `stopTest` (its `setUp` and `tearDown`, not `setUpClass` or
  `setUpModule`), as JUnit charges `@BeforeEach` and not `@BeforeAll`. A test is an integration
  test under an `integration`, `integration_tests`, `e2e` or `end_to_end` folder, or with
  `@pytest.mark.integration` or `@pytest.mark.e2e` on that case, as pytest applies it (decorators,
  classes, `pytestmark`, conftest hooks, or `pytest.param(..., marks=...)` for that case only); the
  unittest advice names only the folder, and the pytest advice reminds that a marker must be
  registered when the project uses `--strict-markers`. `thresholds.unitTestSeconds` and
  `integrationTestSeconds` change the limits. Base snapshots report none.
  The times are those of the coverage run, so they include coverage's tracing overhead. Each test
  over its budget is therefore run once more, alone, without coverage (the `retimeSlowTests` step
  after the tests, `test-runs/slow-retime.mjs`: the node id for pytest, `-k <dotted id>` for
  unittest, written to `rerun-junit.xml`), and reported only when that run is also over budget,
  with its time; a second run that fails or does not report the test keeps the first time. When
  the run that ran tests wrote no JUnit report, one descriptive `test-runtime/slow-test-not-timed`
  finding says so and never fails the run; the same finding names a test file whose tests could
  not be read, and the other files are still checked. A failing test run reports `tests-failed`
  and no slow tests.
- **Pinned runner options.** Options that let a failing run pass are taken out of the project's
  pytest `addopts` (read from the first of `pytest.toml`, `.pytest.toml`, `pytest.ini`,
  `.pytest.ini`, `pyproject.toml`, `tox.ini`, `setup.cfg`, as pytest does) with `-o addopts=...`,
  and out of `PYTEST_ADDOPTS`: `-x`/`--exitfirst` (also inside `-vx`), `--maxfail`, `--sw`,
  `--stepwise`, `--collect-only`, `--setup-only`, `--setup-plan`, `-k`, `-m`, `--deselect`,
  `--reruns`, `--only-rerun` and the other rerun and retry options, and `-p no:` for the
  plugins that collect or report results; with pytest-rerunfailures installed `-o reruns=0` is
  added. A run that collects no test is `python/no-tests-ran`, as before.
- **Size.** `folder-depth-limit` (a package more than 4 levels below the root package, as for Java:
  the common package prefix of the production modules, on the base when there is one, after
  the leading namespace folders without `__init__.py` of each top-level tree, up to its shallowest
  package and never past the folders all its modules share, counted on the base for a tree the
  base has, so a new `__init__.py` deep in a namespace tree moves no root; test packages are measured the same way, with
  `tests`/`test` folders and the source root left out, against the production root),
  `class-methods-limit` (20, not counting `__init__` or `@overload` stubs), `class-fields-limit`
  (10: annotated class attributes that are not `ClassVar`, plus `self.x` assignments in the
  class's own methods, not in a class nested in them; a `Protocol` and an `ABC` with only abstract
  methods have no fields, as Java skips interfaces; a dataclass, attrs class, `NamedTuple` or
  `TypedDict` is a record and gets Java's record wording) and `inheritance-depth-limit` (at most 3
  project base classes above it: an external base such as `Exception` or `models.Model` adds no
  level, and neither does a `Protocol` or interface link; bases are followed through imports and
  aliases, each class once; `class Client(Client)` resolves its base through the import, as Python
  binds the name only after the class body, and classes in an unresolvable cycle are measured from
  their parents outside it) with Java's thresholds, from the classes report of
  `structure_metrics.py` and `class_metrics.py` (`size/python-size.mjs`). Generated files
  (`libraries/generated-files.mjs`) are left out of every size and structure limit, as Java's
  generated sources are: `*_pb2.py`, `*_pb2_grpc.py` and their `.pyi`; a file whose leading
  comments or module docstring carry the header a known generator writes (protoc, gRPC Python,
  datamodel-codegen's `# generated by datamodel-codegen:`, OpenAPI Generator's `Generated by OpenAPI
Generator (https://openapi-generator.tech)`, Thrift, or `Code generated by <tool>. DO NOT
EDIT.`); and a file under a `generated/`, `_generated/` or `__generated__/` folder or named
  `*_generated.py` with a generic marker such as `DO NOT EDIT` or `@generated` in its first five
  lines, as TypeScript gates the same markers on the file name. A docstring that only mentions
  generated code, or `# DO NOT EDIT` in a normally named module, exempts nothing, and neither does
  `# Generated by Django` (migrations are edited by hand; `migrations/` is skipped as before).
  sqlacodegen writes no header, so its output goes in `exclude`. Test files are the files pytest collects
  (`test_*.py`, `*_test.py` and the project's `python_files`), `conftest.py` and everything under
  `tests/` or `test/`. In a Django project (a `django`, `pytest-django` or `djangorestframework`
  dependency, a `manage.py` at the root, or `DJANGO_SETTINGS_MODULE` in the pytest configuration)
  `tests.py`, `tests_*.py` and `*_tests.py` are tests too, in the size limits, the coverage
  `omit`, mutmut's `do_not_mutate` and the duplicate scan; elsewhere a `lab_tests.py` is
  production code, as pytest does not collect it. A `python_files` pattern that matches every
  file (`*.py`) is left out: the files under the `testpaths` folders are the tests then, so the
  production modules keep their checks.
- **Import structure.** From the import scan (`imports/python-import-rules.mjs`):
  `coupling/package-cycle` with Java's message, on each package of a cycle (a package `__init__`
  importing its own submodules is a re-export, not a dependency); `coupling/no-production-cycles`
  for module cycles inside one package; `coupling/no-import-outside-roots` when production code
  imports a project module outside `python.sourceRoots` (scripts, a top-level `tests/` package).
  Type-only imports do not count.
- **Dependencies.** `dependencies/unused-dependency`, `unlisted-dependency` and
  `no-dev-dependency-in-production`, with the TypeScript (knip) messages. The declared
  dependencies come from `languages/python/libraries/python-dependencies.mjs`, a standalone reader
  of `pyproject.toml` (PEP 621 dependencies and extras, `[dependency-groups]`, uv, pdm, hatch
  environments, Poetry dependencies and groups), `Pipfile`, `requirements*.txt` and
  `requirements/*.txt|in`, and `setup.cfg`, that returns `{ runtime, development }` names and each
  declaration with its group. The installed distributions come from
  `importlib.metadata.packages_distributions()` in the project environment
  (`dependencies/distribution-scan.py`). Test imports are checked only when the project declares
  dev dependencies; a package is unused only when no import, entry point, optional backend of a
  declared package, string reference (`"psycopg2"`, `"postgresql://"`), known loaded-by-name
  package (database drivers, `tzdata`, `setuptools`) or package the detected framework loads for
  the project, as knip's plugins do for TypeScript, uses it (Django: `pillow` with an `ImageField`,
  `redis` with `RedisCache`, `pymemcache`, `pylibmc`, `argon2-cffi` and `bcrypt` for the cache
  backends and password hashers named in settings; FastAPI: `python-multipart` with `Form`, `File`
  or `UploadFile`; Flask: `python-dotenv`; pydantic: `email-validator` with `EmailStr`); dynamic or `setup.py`-only
  dependencies switch the checks off. On Python before 3.10 the checks are one
  `dependencies/tool-skipped` tool error and the other analyzers still run.
- **Frameworks.** Django, FastAPI and Flask are detected from the dependencies or the production
  imports (`dependencies/python-frameworks.mjs`). Django settings modules (named `settings`, or
  named by `DJANGO_SETTINGS_MODULE` in `manage.py`, `wsgi.py` or `asgi.py`) may read the
  environment and use `from x import *`; `manage.py`, `wsgi.py` and `asgi.py` may read the
  environment and have no test. FastAPI routers (modules that import `fastapi`) and the modules
  they import directly may use pydantic. Flask needs no allowance yet.
- **Feature folders.** Not applied to Python: the TypeScript feature layout lives under
  `<root>/main/`, and Python has no such convention, so the rule would flag ordinary Django apps and
  FastAPI packages.

## Slices

Each slice is one PR, adds one concern, and changes the Python adapters, ingesters or rules, tests,
and this document. Slice 1 also made the config validation, the preset wiring in `core/` and the
exclude and legacy-inventory policy (`applyFindingPolicy`) serve more than one language.

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
  its own `[tool.mutmut]` runs without a `-n 0` workaround.
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
