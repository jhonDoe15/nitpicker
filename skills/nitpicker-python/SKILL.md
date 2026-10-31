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

To learn why a rule is on and what form it allows before you write or change code, run `npx nitpicker explain <tool/rule>` with the name a finding prints, or read the [rule reference](https://github.com/jhonDoe15/nitpicker/blob/main/docs/rules/README.md). `npx nitpicker rules` lists the rules of this project's preset.

## Write it this way

- Types: annotate every function, method and parameter; strict mypy, pyright or basedpyright (the project's own
  choice) checks the source roots. Fix the type. `# type: ignore`, `# noqa` and `# pyright: ignore`
  are findings themselves, so never write them, nor `# fmt: off`, `@no_type_check`, `if not TYPE_CHECKING:`
  around code, or a `.pyi` beside its `.py`.
- Paths: `pathlib.Path` with `/`, `.read_text()`, `.exists()`. No `os.path`, no `open(path)`.
- Strings: f-strings only. No `.format()` and no `%`.
- Defaults: `None`, then build the value inside the function. No mutable default arguments.
- Parameters: remove an unused one (`@override` marks an override; `_context` only when a callback
  signature fixes it). A `bool` that picks a behavior is keyword-only
  (`def send(message, *, urgent=False)`), two functions or an enum.
- Errors: catch the specific exception and handle it, or re-raise it with its cause:
  `raise ParseError(text) from err`. No bare `except:` or `except Exception:`, and no `raise Exception(...)`.
- Cancellation: after cleanup in an explicit asyncio, Trio or AnyIO cancellation handler, use
  a bare `raise` or re-raise the unchanged caught exception. Returning a failure result or raising
  a different error consumes cancellation (`cancellation-not-propagated`). Keep intentional
  cancellation boundaries in the backend's timeout or cancellation scope. Awaiting a task you
  cancelled yourself (`task.cancel()` then `await task`) is the one handler that may stay quiet.
- A `try` inside a loop is flagged (PERF203): move it out, or extract the loop body into a function.
- Flow: no `else` after a `return`, and return an expression directly instead of assigning it to a
  local first. Build a list with a comprehension, not `append` in a loop.
- Fan-out: bound concurrent remote or message calls. Hold an `asyncio.Semaphore` (or `anyio.CapacityLimiter`) around each call, or `gather` fixed-size chunks. Never `asyncio.gather(*(fetch(u) for u in urls))` over a runtime collection.
- Imports: name what you use. No `from module import *`.
- Trio, AnyIO and `asyncio.TaskGroup`: open a resource around the whole task group or inside the
  child task, never in a `with` inside the group that hands it to `start_soon`/`create_task`
  (`task-outlives-resource`). In Trio and AnyIO, an `await` in `finally:` or a cancellation handler
  needs `with trio.CancelScope(deadline=trio.current_time() + 5, shield=True):` around it (`unshielded-cleanup-await`).
- Output: the project's logger (`logging.getLogger(__name__)`, structlog or loguru), never `print`;
  a `domain` package returns a result instead and leaves logging to `adapters/`. A
  log in an `except` keeps the traceback (`logger.exception(...)` or `exc_info=True`); passing the
  error as an argument or `str(error)` drops it. Logging alone is not handling: also re-raise the
  error or return a failure that carries it.
- Records: `@dataclass(frozen=True)`, and `dataclasses.replace` for a changed copy. The project's
  validation library (pydantic by default) only in an `adapters/` package, where untrusted input is
  parsed once; pass frozen dataclasses on from there.
- Constants: a fixed set of strings is an `enum.StrEnum` (`class X(str, Enum)` before Python 3.11),
  not `STATUS_ACTIVE = "active"` constants or a class holding them. Settings like `DB_HOST` are fine.
- Signatures: a value with three states is an enum, not `bool | None`; test `None` with
  `x if x is not None else default`, never `x or default`; return a new list or dict instead of
  changing an argument (`items.append`). When code moves, change every caller and delete the old
  name: no alias (`Old = New`), module `__getattr__`, `@deprecated` or `DeprecationWarning` shim.
- Every other rule (logging, naming, environment access, the domain, paths, secrets, shell and SQL,
  test honesty) reports the allowed form in its message: follow the form the message names.
- Tests: use the project's runner (pytest, unittest, Django or nose2). Every test asserts something. Every branch you add needs a test, and a
  surviving mutant fails: assert the exact value, so a changed line breaks a test. A test you add
  or edit takes at most 5 s (`slow-test`), or 30 s under an `integration` or `e2e` folder or with
  `@pytest.mark.integration` (registered when the project uses `--strict-markers`): patch the clock
  instead of `time.sleep` and fake network, database and disk access. A test over budget is run
  again alone without coverage and fails only if it is still over. Lift a legitimate one in the
  top-level `exceptions` with `{ "rule": "slow-test", "paths": [...], "reason": "..." }`.
- Assert the value, not that something is there (`weak-assertion`): no `assert x`, `assert x is not None`
  or `assert len(x) > 0` as the whole check, and no `m.assert_called()` or `assert_called_with(ANY)`; assert
  the exact value, contents or length and the call's arguments. A not-null check is fine when the test uses `x` afterwards.
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
