# Configuration

Part of the [Python preset guide](../python-preset.md).

A `$schema` line in the file gives the editor completion and inline errors for these keys
(`python.environment`, `python.formatter`, `python.testRunner`, `python.typeChecker`, `python.exceptions`,
`tools.ruff`, `tools.black`, `tools.pyright`, `tools.mypy`, `tools.mutmut`, the `python.*` conventions) and
flags the TypeScript-only keys this preset refuses. A Python project has no `node_modules`, so it
points at the published file: `"$schema": "https://raw.githubusercontent.com/jhonDoe15/nitpicker/main/spec/config.schema.json"`. nitpicker ignores the line; see
[Editor support](usage.md#editor-support).

Config keys with this preset: `base`, `disable` (the analyzer names are `python` and `mutation`), `analyzers`, `analyzerTimeoutMinutes`, the keys shared by all languages,
`thresholds` (`crapLimit`, enforced from slice 3, the file limits `fileLines`, `testFileLines`,
`lineLength` and `folderFiles`, the size limits `folderDepth`, `classMethods`, `classFields` and
`inheritanceDepth`, and the [slow test](slow-tests.md) budgets `unitTestSeconds` and
`integrationTestSeconds`), `testConsole` (see [new console output](new-console-output-from-tests.md)), `exclude` (findings under the globs are dropped) and
`legacyInventory` (same format and `baseline-expansion` rule as for Java), `history` (the opt-in
[change history](../usage.md#change-history) check), and the `python` object below. `layout.featureRoots` and `layout.sharedRoots` place the [feature folders](feature-folders.md), which
`contract-infrastructure-type` reads too, and `featureRoots` also names the feature folders `co-change` reads (the other `layout` keys describe
TypeScript sources and are an error). The
top-level `exceptions` is accepted only for the rules shared with the other languages: the [feature folder rules](feature-folders.md), the file and size limits
(`file-lines-limit`, `line-length-limit`, `folder-files-limit`, `slow-test`, `folder-depth-limit`,
`class-methods-limit`, `class-fields-limit`, `inheritance-depth-limit`), the function rules
(`function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`,
`function-parameters-limit`, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`,
`mutant-survived`, `mutant-nocoverage`, which take `function` to name one function), and
`unused-option`, whose messages name it, the
[dependency and repository checks](../usage.md#dependency-and-repository-checks), the
[fact rules](../../spec/checks.md#custom-rules) every preset shares (`test-console-output`, `test-only-export`, `duplicate-definition`,
`exported-name-collision`, `sibling-copy-edit`, `doc-comment-content`), which the Python preset runs over its facts scan, and
`co-change` of the [change history](../usage.md#change-history) check (with a `<module>/**` glob); the
Python equivalent of `exceptions` for every other rule is `python.exceptions`. Each list rejects the
other's rules (a function or file rule in `python.exceptions`, or a ruff code in `exceptions`, is a
config error that names the right list). `python` is an error with any other preset.
Where each kind of finding is lifted for some paths:

| Findings                                                                                                                    | Lifted by                   |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| ruff codes (or a prefix such as `PTH`), mypy codes, pyright and basedpyright `report*` rules                                | `python.exceptions`         |
| `python-rules` ids (`sleep-in-test`, `forwarding-wrapper`, `no-inline-suppression`, ...)                                    | `python.exceptions`         |
| one third-party console message                                                                                             | `testConsole.allow`         |
| `file-lines-limit`, `line-length-limit`, `folder-files-limit`, `test-runtime/slow-test`, `test-console/test-console-output` | top-level `exceptions` only |
| the fact rules (`facts/test-only-export`, `facts/doc-comment-content`, `facts/sibling-copy-edit`, ...)                      | top-level `exceptions` only |
| the size limits (`folder-depth-limit`, `class-methods-limit`, ...) and `python-rules/unused-option`                         | top-level `exceptions` only |
| the function rules (`function-lines-limit`, `crap-score-limit`, `mutant-survived`, ...)                                     | top-level `exceptions` only |

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
        "rule": "PERF203",
        "paths": ["src/importers/**"],
        "reason": "Each row is validated on its own and a bad row must not stop the rest."
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
| `entryPoints`  | array of project-relative globs                                    | none; see [Composition roots](the-shared-one-way-rules.md)                           |
| `exceptions`   | array of `{ rule, paths, reason }`                                 | none; see [Exceptions](#exceptions)                                                  |

`python.entryPoints` lists the files that start the program, such as a job runner or a worker that
reads its settings from the environment or connects at import (see the composition roots below).
`process-env-access`, `process-stream-access` and `import-time-effect` skip a file listed there.
Like `layout.entryPoints`, an added or removed entry is listed among the policy changes and does
not fail the gate; the base snapshot is measured with the entry points both sides declare.

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

## Exceptions

There is no inline disable: `# noqa`, `# type: ignore`, `# pyright: ignore` and the other comments
in the table below are findings themselves. The way out is `python.exceptions` in
`nitpicker.config.json` (the top-level `exceptions` for the function, file and size rules, below),
the same shape as in every preset: `rule` (the id printed in the finding, for example `PERF203`, `PTH118`, `frozen-dataclass`,
`return-value`, `reportReturnType`), `paths` (a non-empty array of globs relative to the project)
and `reason` (required text). It lifts that rule for those paths, in the base and in the head
snapshot alike, and every exception is listed in the report's config overrides. The id is checked
when the config loads: a ruff code (or a prefix such as `PTH`, which covers every `PTH` code), a
`python-rules` id, a mypy error code or a pyright or basedpyright `report*` rule; a typo such as `T210` is a config
error, not a silent no-op. Prefer fixing the code; an exception is for code that is
legitimately outside the rule, such as a loop that must handle each item on its own or a module that
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
`PERF203` (`try` in a loop that must handle each item) and `F401` (an `__init__.py` that
re-exports): lift them for the path with `python.exceptions`, or `exclude` the path, for example
`"exclude": ["src/demo/cli.py", "**/__init__.py"]`. A command-line tool does not need either: it
writes its result through the `TextIO` form of `process-stream-access` below. The project's own
ruff configuration (`[tool.ruff]`, `ruff.toml`) is not read for linting until `"tools": { "ruff": { "precedence":
["project", "nitpicker"] } }` opts it in; then the rules it selects run next to nitpicker's (never
instead of them: an `ignore` or `per-file-ignores` entry for a nitpicker rule is dropped, and
`python.exceptions` lifts those) and its rule options merge with nitpicker's (see
[Formatter and detekt configs](../usage.md#formatter-and-detekt-configs-python-and-kotlin-presets)). Of
the coverage configuration only the settings that say how the tests run are kept (see the test step
below), so the result means the same on every project; there is no override key for them.

The formatter is `black` when `pyproject.toml`, `setup.cfg`, `tox.ini`, `Pipfile`,
`.pre-commit-config.yaml` or a requirements file (`requirements*.txt`, `requirements/*.txt`) has a
`[tool.black]` table, `black` as a dependency (a requirements line, a poetry key or an entry of any
TOML dependency array), a `tox` command, or the `psf/black` or `black-pre-commit-mirror` repository
or the `black` hook id, and none of them configures ruff's formatter (`[tool.ruff.format]`, a
`[format]` table in `ruff.toml`, the `ruff-format` hook). The choice is read from the head checkout
for both snapshots, so a change that switches formatter is checked against a merge base formatted
the same way, and only the files it touches can fail.

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
ignored: `Ignoring [tool.ruff] in pyproject.toml except lint.flake8-pytest-style; opt in with
"tools": { "ruff": { "precedence": ["project", "nitpicker"] } }` (the flake8-pytest-style options
are read without the opt-in). Each format finding refers to the command and names
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
chain and the located files are part of the cache key, and an edit of the opted-in settings (the
`[tool.ruff]` or `[tool.black]` table, not the rest of `pyproject.toml`) is a policy change a person
reviews; comments and layout do not count. The line length that the conventions take from the config is read from the merge base in a comparison (its parent-folder configs and `extend`ed files included; the branch's own config only when the base has no Python sources), so a pull request cannot raise its own limit by editing the config. The format command then passes the followed value (`--line-length`, the quote style of ruff, indentation) wherever the head config says another one, and the printed command shows it. Which formatter applies which convention:
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
