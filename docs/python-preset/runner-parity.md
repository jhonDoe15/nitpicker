# Runner parity

Part of the [Python preset guide](../python-preset.md).

What the Python preset does the way the TypeScript and Java presets do (`parity/python-runner`).

- **Failing tests.** pytest runs with `--junitxml` (xunit1, so each case has its file and line) and
  `--continue-on-collection-errors`; exit status 1 with failing cases is no longer a failure of
  the analyzer. The static analyzers run as usual, coverage and CRAP come from the tests that ran,
  and the failing tests are one `tests/tests-failed` tool error per snapshot, listing up to 50 tests
  with the line of the failing assertion and the error's first line, as Java's `tests/tests-failed`
  (`test-runs/test-failures.mjs`). unittest failures are read from its `FAIL:`/`ERROR:` blocks
  and their tracebacks. A run that exits 1 without naming a test, or whose
  failures are only collection errors (pytest) or load errors (unittest's `_FailedTest`), is a
  `python/tests-not-run` tool error on both snapshots.
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
  not charged to the first test that uses it, nor one that a function fixture or the test sets up
  through `request.getfixturevalue`, a function fixture another one requests counts once, and records each case's marks; unittest times each
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
  importing its own submodules is a re-export, not a dependency, and a cycle whose packages all
  belong to the features of a reported [`feature-cycle`](feature-folders.md), and that no import
  outside that feature cycle closes, is left out); `coupling/no-production-cycles`
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
- **Unresolved imports.** `dependencies/unresolved-import` (`imports/unresolved-imports.mjs`), worded
  like the TypeScript (knip) finding, in production modules and in the test files pytest collects
  (`test_*.py`, `*_test.py`, `conftest.py`, `tests.py`, not under a `fixtures`, `data`, `testdata`,
  `test_data`, `outputs`, `samples`, `resources` or `snapshots` folder). Files a tool outside the
  environment runs are left out: `conf.py` anywhere, and `setup.py`, `noxfile.py`, `fabfile.py`,
  `dodo.py`, `pavement.py`, `hatch_build.py`, `build.py` and `tasks.py` at the project root.
  - An absolute import is unresolved when its top-level name is not in the standard library, not
    provided by an installed distribution, not found by `importlib.util.find_spec` in the
    environment (editable installs, `.pth` paths), not the name of a folder or `.py` file of the
    project, not a module file (`.so`, `.pyx`, ...) in the importing file's folder or a folder
    above it, and not a declared or `build-system` requirement. A requirement matches by name
    (`markdown_it` matches `markdown-it-py`, `dateutil` matches `python-dateutil`, `environ`
    matches `django-environ`) or by a table of known import names (`PIL`, `cv2`, `sklearn`,
    `yaml`, `bs4`, `win32api` and the other pywin32 modules, the pyobjc frameworks, ...). When the
    environment has no distribution installed at all, this half is off.
  - Under a regular package of the project (one with `__init__.py`, in any source root), and for
    a relative import from the importing file's folder, each dotted part must exist on disk: a
    folder, or for the last part a module file (`.py`, `.pyi`, `.pyx`, `.so`, `.pyd`, ...).
    `from pkg import name` checks `pkg` only, since `name` can be an attribute. A relative import
    that climbs to or above the project root is left to Python. Trusted: a package whose
    `__init__.py` or any module touches `__path__`, `sys.modules` or `declare_namespace`;
    generated modules (`_version`, `__version__`, `version`, `*_pb2`, `*_pb2_grpc`); and a
    missing last part when the project builds compiled extensions (`meson-python`,
    `scikit-build-core`, `maturin`, `setuptools-rust`, `pybind11`, `nanobind`, `cython` or `cffi`
    in `build-system.requires`, or a root `meson.build`, `CMakeLists.txt` or `Cargo.toml`).
  - Not checked: imports under `if TYPE_CHECKING:`; in a `try` that catches `ImportError`,
    `ModuleNotFoundError`, `Exception` or everything (its body and handlers); in the `else` of any
    `try`; under `with suppress(ImportError)`; under an `if` that tests the environment (`sys.*`,
    `os.name`, `os.environ`, `getenv`, `platform`, `version_info`, `find_spec`, an all-caps flag
    such as `PY2` or `_HAS_NUMPY`, a name assigned from one of those, or a name a guarded `try`
    binds by import or to a constant, such as `has_simplejson`); and function-local imports in
    test files (tests that write a module and then import it).
  - mypy and pyright report missing imports too, but a project's `ignore_missing_imports`
    silences them; TypeScript likewise reports both `tsc` and knip.
- **Frameworks.** Django, FastAPI and Flask are detected from the dependencies or the production
  imports (`dependencies/python-frameworks.mjs`). Django settings modules (named `settings`, or
  named by `DJANGO_SETTINGS_MODULE` in `manage.py`, `wsgi.py` or `asgi.py`) may read the
  environment and use `from x import *`; `manage.py`, `wsgi.py` and `asgi.py` may read the
  environment and have no test. FastAPI routers (modules that import `fastapi`) and the modules
  they import directly may use pydantic. Flask needs no allowance yet.
