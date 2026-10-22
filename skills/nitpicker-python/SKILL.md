---
name: nitpicker-python
description: Use before writing or changing Python in a project that runs nitpicker with the python preset, so the code follows nitpicker's one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for Python

nitpicker allows one way to write each construct. Write it that way from the start; the gate is a
backstop. It fails only on findings your change adds, so leave code the task doesn't need alone.

## Finish with the gate

1. Run the project's tests with its own runner (pytest, unittest, `manage.py test` or nose2).
   Failing tests are a tool error that names them; coverage and CRAP then come only from the tests
   that pass, and mutation testing leaves the failing modules out.
2. When the change is complete, run `npx nitpicker` as a background command you wait on, without a
   pipe: you need its exit code. It has no `--fix` for Python; format with the "Format with ..." command
   printed at the start of the run (the gate does not read the project's formatter config). It takes minutes and prints a progress line for each slow analyzer.
3. Act on the exit code:
   - 0: done.
   - 1: fix every new finding and any tool error listed below them, then rerun.
   - 2: no new findings, but a tool failed. Fix the cause it names (usually a failing test or a
     tool missing from the environment) and rerun. Exit 2 is never a pass. If it says another run
     is in progress, wait for that run; never kill it.
4. Never suppress: no `# noqa`, `# type: ignore`, `# pragma: no mutate`, `do_not_mutate`, config
   `exclude`/`disable`/`exceptions`, legacy entries, or weakened tests (`-x`, `-k`, `--deselect` and
   reruns in `addopts` are ignored anyway). If a finding seems wrong, stop and ask. Never pass
   `--accept-policy-change` or set `NITPICKER_ACCEPT_POLICY_CHANGE`: a
   `nitpicker-config/policy-loosened` finding is for a person to accept.

## Write it this way

- Types: annotate every function, method and parameter; strict mypy, pyright or basedpyright (the project's own
  choice) checks the source roots. Fix the type. `# type: ignore`, `# noqa` and `# pyright: ignore`
  are findings themselves, so never write them, nor `# fmt: off`, `@no_type_check`, `if not TYPE_CHECKING:`
  around code, or a `.pyi` beside its `.py`.
- Paths: `pathlib.Path` with `/`, `.read_text()`, `.exists()`. No `os.path`, no `open(path)`.
- Strings: f-strings only. No `.format()` and no `%`.
- Defaults: `None`, then build the value inside the function. No mutable default arguments.
- Errors: catch the specific exception and handle it, or re-raise it with its cause:
  `raise ParseError(text) from err`. No bare `except:` or `except Exception:`, and no `raise Exception(...)`.
- A `try` inside a loop is flagged (PERF203): move it out, or extract the loop body into a function.
- Flow: no `else` after a `return`, and return an expression directly instead of assigning it to a
  local first. Build a list with a comprehension, not `append` in a loop.
- Imports: name what you use. No `from module import *`.
- Output: the project's logger (`logging.getLogger(__name__)`, structlog or loguru), never `print`. A
  log in an `except` keeps the traceback (`logger.exception(...)` or `exc_info=True`); passing the
  error as an argument or `str(error)` drops it. Logging alone is not handling: also re-raise the
  error or return a failure that carries it.
- Async: inside `async def`, `await asyncio.sleep(...)`, an async client (`httpx.AsyncClient`),
  `asyncio.create_subprocess_exec`, and `await asyncio.to_thread(...)` for other blocking calls. No
  `timeout` parameter: the caller wraps the call in `async with asyncio.timeout(...)`, and the scope
  holds an `await`. Wait on an `asyncio.Event`, not a sleep loop.
- Time: aware datetimes only: `datetime(2026, 1, 1, tzinfo=timezone.utc)`,
  `datetime.now(tz=timezone.utc)`, `datetime.fromtimestamp(value, tz=timezone.utc)`. Parse with
  `%z`, `.replace(tzinfo=...)` for a known zone, or `date.fromisoformat(text)` for a date-only
  string. A date is `datetime.now(tz=zone).date()` in the zone it is meant in, not `date.today()`.
  Domain code takes the clock as a parameter; tests pass a fixed aware datetime or freeze the time.
- Loggers: `logging.getLogger(__name__)`, never `logging.Logger(...)` or the root `logging.info(...)`;
  `logger.exception(...)` only inside an `except`, `logging.WARNING` rather than `WARN`.
- Debugging and processes: remove debugger imports and breakpoints before committing. Pass
  `check=True` to `subprocess.run`, or `check=False` and handle `returncode`.
- Loops and calls: bind a new name rather than reassigning the loop variable; pass a function
  itself (`key=str`), not `lambda x: str(x)`; one `max(a, b, c)`, not nested calls.
- Records: `@dataclass(frozen=True)`, and `dataclasses.replace` for a changed copy. The project's
  validation library (pydantic by default) only in an `adapters/` package, where untrusted input is
  parsed once; pass frozen dataclasses on from there.
- Constants: a fixed set of strings is an `enum.StrEnum` (`class X(str, Enum)` before Python 3.11),
  not `STATUS_ACTIVE = "active"` constants or a class holding them. Settings like `DB_HOST` are fine.
- Every other rule (logging, naming, environment access, the domain, paths, secrets, shell and SQL,
  test honesty) reports the allowed form in its message: follow the form the message names.
- Tests: use the project's runner (pytest, unittest, Django or nose2). Every test asserts something. Every branch you add needs a test, and a
  surviving mutant fails: assert the exact value, so a changed line breaks a test. A test you add
  or edit takes at most 5 s (`slow-test`), or 30 s under an `integration` or `e2e` folder or with
  `@pytest.mark.integration` (registered when the project uses `--strict-markers`): patch the clock
  instead of `time.sleep` and fake network, database and disk access. A test over budget is run
  again alone without coverage and fails only if it is still over. Lift a legitimate one in the
  top-level `exceptions` with `{ "rule": "slow-test", "paths": [...], "reason": "..." }`.
- Dependencies: every package production code imports is a production dependency of the project
  (pyproject, Pipfile, requirements or setup.cfg); test-only packages go in a dev group; remove a
  dependency nothing uses.
- A finding that flags legitimate code (a command line entry point that prints) is lifted in
  `nitpicker.config.json`. A ruff, type-checker, `python-rules`, import-linter, duplicate or coupling
  finding goes under `python.exceptions`, with an entry such as
  `{ "rule": "T201", "paths": ["src/cli/**"], "reason": "..." }`, the rule being the id in the
  message. A function, CRAP, changed-branch coverage, mutation, file or size finding goes under the
  top-level `exceptions`
  (`{ "rule": "function-lines-limit", "paths": [...], "function": "name", "reason": "..." }`). Each
  message ends with the entry and the list that takes it; each list rejects the other's rules.
  Don't add one to get past the gate: stop and ask.

## Repository files

- The gate fails committed secrets, binaries, build output and files over 1 MB; each message names
  the fix. Don't add an `exceptions` entry to get past one: stop and ask.

## Size

- A function stays within 50 lines, 15 statements, 2 levels of control nesting and 3 parameters;
  past 3 parameters, pass a frozen dataclass. A `lambda` is a function of its own with the same
  limits, counted on its own and not toward the function around it. Complex code needs tests: the
  CRAP score of a function must stay below 9.
- Each `elif` and `except` adds a nesting level: `if`/`elif`/`elif` is already too deep. Return
  early, look the value up in a dict, or move a branch into a helper.
- A new clone of at least 5 lines and 50 tokens (`duplicate-clone`) fails: extract a function, also when the copy has other names and literals. A
  package must not depend on a less stable one (`stability-direction`).
- A class has at most 20 methods and 10 fields, and at most 3 project base classes above it
  (`Exception` or `models.Model` add none). A package sits at most 4 levels below the root package. Modules and packages must not import
  each other in a cycle, and production code imports only from the source roots.
- A module stays within 300 lines (a test module 500) and a line within 120 characters. A folder
  holds at most 6 modules and 6 test modules directly: group the rest into packages by what they do.
- A function or file already over a limit may be edited but must not get worse: put new code in a
  new function or module and call it.
