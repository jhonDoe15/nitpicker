# The project's own environment

Part of the [Python preset guide](../python-preset.md).

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

## The base snapshot and its environment

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
