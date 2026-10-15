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
4. Never suppress: no `# noqa`, `# type: ignore`, config `exclude`/`disable`/`exceptions`, legacy entries, or
   weakened tests. If a finding seems wrong, stop and ask.

## Write it this way

- Types: annotate every function, method and parameter; strict mypy or pyright (the project's own
  choice) checks the source roots. Fix the type. `# type: ignore`, `# noqa` and `# pyright: ignore`
  are findings themselves, so never write them, nor `# fmt: off`, `@no_type_check`, `if not TYPE_CHECKING:`
  around code, or a `.pyi` beside its `.py`.
- Paths: `pathlib.Path` with `/`, `.read_text()`, `.exists()`. No `os.path`, no `open(path)`.
- Strings: f-strings only. No `.format()` and no `%`.
- Defaults: `None`, then build the value inside the function. No mutable default arguments.
- Errors: catch the specific exception and handle it, log it with `logger.exception(...)`, or
  re-raise. A new exception raised inside `except` keeps the cause: `raise ParseError(text) from err`
  (or `from None`). No bare `except:`, `except Exception:` or `except X: pass`;
  one expected error that is deliberately ignored is `with contextlib.suppress(SpecificError):`.
- A `try` inside a loop is flagged (PERF203): move it out, or extract the loop body into a function.
- Flow: no `else` after a `return`, and return an expression directly instead of assigning it to a
  local first. Build a list with a comprehension, not `append` in a loop.
- Imports: name what you use. No `from module import *`.
- Output: `logger = logging.getLogger(__name__)` and `logger.info(...)`. No `print`.
- Records: `@dataclass(frozen=True)`, and `dataclasses.replace` for a changed copy. Pydantic only in
  an `adapters/` package, where untrusted input is parsed once; pass frozen dataclasses on from there.
- Constants: a fixed set of strings is an `enum.StrEnum` (`class X(str, Enum)` before Python 3.11),
  not `STATUS_ACTIVE = "active"` constants or a class holding them. Settings like `DB_HOST` are fine.
- Tests: use the project's runner (pytest or unittest). Every branch you add needs a test, and a
  surviving mutant fails: assert the exact value, so a changed line breaks a test.
- A finding that flags legitimate code (a command line entry point that prints) is lifted in
  `nitpicker.config.json`, under `python.exceptions`, with an entry such as
  `{ "rule": "T201", "paths": ["src/cli/**"], "reason": "<why this is intended>" }`, the rule being the id in the
  message. A structure, CRAP, changed-branch coverage, mutation, duplicate or coupling finding ends
  with its own entry for the top-level `exceptions`
  (`{ "rule": "function-lines-limit", "paths": [...], "function": "name", "reason": "<why this is intended>" }`).
  Don't add one to get past the gate: stop and ask.

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
