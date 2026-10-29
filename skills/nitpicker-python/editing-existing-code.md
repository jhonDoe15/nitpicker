# Editing existing code

Read this when your change edits a function that existed before it. Everything in `SKILL.md` still
applies to the lines you add.

- A function already over a size limit (lines, statements, nesting, parameters) may be edited but
  must not grow: the gate prints `grew from 77 to 78 lines`. Add one call to a new function and
  put the new code there, below the legacy function: above it, git can read the function's first
  lines as rewritten, and a `print` on them then counts as new. To make room, extract the smallest
  existing block; extracted code is new code and must meet every rule. Don't rename the function
  or move it to another module: its findings return as new, at full size.
- A module, package or class already over its limit must not grow either: put the new code in a
  new module, and a new module in a subpackage (a full folder takes no 7th module; a class with
  more than 10 fields takes a nested dataclass, not another field). Moving functions out into a
  new module is fine, and so is `git mv` of a file, edits included.
- Findings are matched by rule, file and message, not by line. You may edit a line that has a
  finding while its message stays the same, but a second finding with the same message in the file
  is new (another `os.path.join`, `.format()` or `raise Exception`), and the gate may point at the
  older line. Renaming what the message names (``Local variable `label` ...``) makes it new too.
- On a line you add or edit, these are new even when the line had them before: `print`, a broad
  `except`, a magic number in a comparison, commented-out code, `global`, `eval`/`exec`, a shell
  string, and every `python-rules/...` finding (a swallowed exception, `Any` in `domain/`, an
  environment read, an unfrozen dataclass). A finding sits on one line (the `except`, the `def`,
  the `class`); the rest of that block doesn't count. Leave that line alone or write the allowed
  form: `except TypeError:` over a `pass` still fails as a swallowed exception.
- Run the formatter only over a file that was formatted before your change. The format finding of
  an unformatted file is held, but a formatter run rewrites its lines, and the findings on them
  count as edited (`print('x')` becoming `print("x")`). Write your own lines in the formatter's
  style anyway.
- Editing the body of an unannotated function needs no annotations. Touching its signature does:
  annotate every parameter and the return type (mypy reports a half-annotated signature as new
  findings) and fix what the types now expose, such as a `bool` positional parameter. Typed code
  that calls an unannotated function fails (`Call to untyped function`): annotate the callee.
- A line with a branch (an `if`, loop or `case`) that you touch needs both outcomes tested, even if
  no test covered it before. A body line under an untested `if` is not a branch line.
- When an enum gains a member, a legacy `if`/`elif` chain takes its default branch and the gate
  stays quiet. Replace the chain with a dict keyed by the enum (`LABELS[status]`) and
  `parametrize` a test over `list(Status)`, so a missing member fails it. A `match` over the enum
  fails changed-branch coverage on its last `case`, with or without `case _: assert_never(...)`.
- A legacy function over the CRAP limit may be edited while its score does not rise; tests that
  cover more of it lower the score.
