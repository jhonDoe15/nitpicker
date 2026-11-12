# Slice 6: mutation testing

Part of the [Python preset guide](../python-preset.md).

Mutation testing follows [mutation-testing.md](../mutation-testing.md) and the shared mutation rule
(`shared/rules/mutation.mjs`, the one the Java preset's PIT ingester feeds too): no score gate, a
new `Survived` mutant fails as `mutant-survived`, a new `NoCoverage` mutant fails as
`mutant-nocoverage`, and every other status (`Timeout`, `RuntimeError`, `CompileError`, `Ignored`)
is a descriptive finding that never fails. A mutant is identified by its function (`Class.method`),
the original and the mutated text and its occurrence among identical mutants of that status in the
function, never by a line number, so edits above a survivor keep it baselined. The line is only the
location: the line of the first token the mutant changes, so a mutant that removes a `case` arm is
reported at the arm's `case` line, not at the end of the arm before it.

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
  pinned `PYTEST_ADDOPTS` of [Runner parity](runner-parity.md) apply here too. When pytest-xdist is installed the run gets
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
  test files (`tests/`, `test/`, a top-level `testing/`, `test_*.py`, `*_test.py`, `conftest.py`,
  and the Django test names in a Django project) and the `exclude` globs, so an
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
  killed by any test. Mutants that change nothing but the `case _:` arm that closes an exhaustive
  `match` (the arm the coverage settings exclude, matched by the same pattern in
  `languages/python/ingest/coverage-reports/exhaustive-match.mjs`) are left out: the type checker
  proves that code unreachable. A mutant of any other `assert_never` line is reported. The ways out are an `exceptions` entry for `mutant-survived` or
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

## Why mutmut, and how its results are read

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

## Reusing base results on head

As the TypeScript preset does with Stryker's incremental file, head starts from the base run's
results when that is safe: the `mutants/*.meta` files of the base work tree are copied into the
head work tree before `mutmut run`, and mutmut re-tests the mutants of the functions whose code
changed and the ones it has no result for. This happens when every file changed between the base
commit and head is an added or modified `.py` file under a source root that is not a test
(a test file as defined under the rules: a file the project's pytest `python_files` and `testpaths`
collect, a `conftest.py`, a Django `tests.py` only in a Django project, or a file in a test
folder; the CRAP check leaves out the same files). Anything else (a test, a dependency
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
