---
name: nitpicker-python
description: Use before writing or changing Python in a project that runs nitpicker with the python preset, so the code follows nitpicker's one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for Python

nitpicker allows one way to write each construct. Write it that way from the start; the gate is a
backstop. It fails only on findings your change adds, so leave code the task doesn't need alone.

## Finish with the gate

1. Run the project's tests with its own runner (pytest or unittest). Failing tests stop coverage,
   CRAP and mutation from running.
2. When the change is complete, run `npx nitpicker` as a background command you wait on, without a
   pipe: you need its exit code. It has no `--fix` for Python; format with the project's ruff or
   black. It takes minutes and prints a progress line for each slow analyzer.
3. Act on the exit code:
   - 0: done.
   - 1: fix every new finding and any tool error listed below them, then rerun.
   - 2: no new findings, but a tool failed. Fix the cause it names (usually a failing test or a
     tool missing from the environment) and rerun. Exit 2 is never a pass. If it says another run
     is in progress, wait for that run; never kill it.
4. Never suppress: no `# noqa`, `# type: ignore`, config `exclude`/`disable`, legacy entries, or
   weakened tests. If a finding seems wrong, stop and ask.

## Write it this way

- Types: annotate every function, method and parameter; strict mypy, pyright or basedpyright (the project's own
  choice) checks the source roots. Fix the type. `# type: ignore`, `# noqa` and `# pyright: ignore`
  are findings themselves, so never write them, nor `# fmt: off`, `@no_type_check`, `if not TYPE_CHECKING:`
  around code, or a `.pyi` beside its `.py`.
- Paths: `pathlib.Path` with `/`, `.read_text()`, `.exists()`. No `os.path`, no `open(path)`.
- Strings: f-strings only. No `.format()` and no `%`.
- Defaults: `None`, then build the value inside the function. No mutable default arguments.
- Errors: catch the specific exception and handle it, or re-raise it with its cause:
  `raise ParseError(text) from err` (or `from None`). Logging alone is not handling: a handler that only
  logs, prints, or does `pass`, `...`, `continue`, `return None` / `return []` (or another constant) or
  `x = None` is flagged, so re-raise, return a failure value built from the error, or return a named default.
  No bare `except:`, `except Exception:`, or `raise Exception(...)`; raise `TypeError` for a wrong type. Inside a handler,
  `logger.exception("...")` is the log call, with no `exc_info` and no exception in the message.
  `except ImportError: x = None` is the one allowed constant assignment. One expected error that is
  deliberately ignored is `with contextlib.suppress(SpecificError):`, never `suppress(Exception)`.
- A `try` inside a loop is flagged (PERF203): move it out, or extract the loop body into a function.
- Flow: no `else` after a `return`, and return an expression directly instead of assigning it to a
  local first. Build a list with a comprehension, not `append` in a loop.
- Imports: name what you use. No `from module import *`.
- Output: `logger = logging.getLogger(__name__)` and `logger.info(...)`. No `print`.
- Records: `@dataclass(frozen=True)`, and `dataclasses.replace` for a changed copy. Pydantic only in
  an `adapters/` package, where untrusted input is parsed once; pass frozen dataclasses on from there.
- Constants: a fixed set of strings is an `enum.StrEnum` (`class X(str, Enum)` before Python 3.11),
  not `STATUS_ACTIVE = "active"` constants or a class holding them. Settings like `DB_HOST` are fine.
- Also enforced, so write it this way: log with arguments (`logger.info("Loaded %s", count)`, never an
  f-string); read `os.environ` only in `main.py`, `settings.py` or another composition root and pass the
  values in; in `domain/` take the clock, ids and random values as parameters, do no I/O and use no
  `Any`; no module-level dict, list or set that a function changes; a path from user input is resolved and
  checked with `is_relative_to` before use; name numbers other than -1, 0, 1, 2, 10, 100 and 1000 as
  constants, and a string used three times; no `util`, `helper` or `manager` names; no hardcoded secret,
  and never a secret in a log call; `subprocess.run([...])` with a list, a `timeout=` on `requests` calls,
  `yaml.safe_load`, `hashlib.sha256`, no pickle; a boolean parameter is keyword-only; no commented-out
  code; `# TODO(#123)` names an issue. Tests: a reason on every skip, no `time.sleep`, no `assert True`,
  no real clock, unseeded random values or network in a unit test, and test files named `test_*.py` (or
  what `python_files` says). `ruff`'s `PT`, `S`, `N` and `ARG` rules apply as well.
- Tests: use the project's runner (pytest or unittest). Every branch you add needs a test, and a
  surviving mutant fails: assert the exact value, so a changed line breaks a test.
- A finding that flags legitimate code (a command line entry point that prints) is lifted in
  `nitpicker.config.json`, under `python.exceptions`, with an entry such as
  `{ "rule": "T201", "paths": ["src/cli/**"], "reason": "..." }`, the rule being the id in the
  message. Don't add one to get past the gate: stop and ask.

## Size

- A function stays within 50 lines, 15 statements, 2 levels of control nesting and 3 parameters;
  past 3 parameters, pass a frozen dataclass. Complex code needs tests: the CRAP score of a
  function must stay below 9.
- Each `elif` and `except` adds a nesting level: `if`/`elif`/`elif` is already too deep. Return
  early, look the value up in a dict, or move a branch into a helper.
- A new clone of at least 5 lines and 50 tokens (`duplicate-clone`) fails: extract a function. A
  package must not depend on a less stable one (`stability-direction`).
- A module stays within 300 lines (a test module 500) and a line within 120 characters. A folder
  holds at most 6 modules and 6 test modules directly: group the rest into packages by what they do.
- A function or file already over a limit may be edited but must not get worse: put new code in a
  new function or module and call it.
