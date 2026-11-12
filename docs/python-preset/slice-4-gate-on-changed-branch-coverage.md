# Slice 4: gate on changed branch coverage

Part of the [Python preset guide](../python-preset.md).

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
- **Identity.** `branch-source:<16 hex>`, a hash of the line's source text without formatting
  (tokens: spacing, quote style and a trailing comma in a call, list, set or dict do not count,
  while the text inside a string and the comma of a one-element tuple do), with `#2`, `#3` for
  identical lines in one enclosing scope, in order. The scope is the chain of `def` / `class`
  names found from the line's indentation (`Class.method`, empty at module level), so a new
  identical line in another function does not renumber a legacy gap. No line number, so inserting
  code above keeps the finding baselined and a renamed file follows the rename map. Moving a gap
  into another function, or renaming its function, makes a new identity, which matters only when
  the branch line itself is also changed.
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
  A line ruff format or black only reformatted is not a changed line and keeps its identity,
  including a one-line `if x: print(x)` that the formatter splits in two (the identity is the
  header up to the `:`). A file without readable source text is skipped.
  Coverage comes from the tests of the snapshot being analyzed, so adding or removing a
  test changes which branches are covered on head.
- **Exceptions.** `# pragma: no cover` and `# pragma: no branch` are not honored (the generated
  `exclude_lines` does not list them and `partial_branches` is empty), and the project's own
  report settings are ignored, so the one measurement is the same everywhere (unless
  `tools.coverage` opts the project's exclusions in, see the test step). Only idioms that are
  never testable are excluded, with the same list on every coverage.py version: `if TYPE_CHECKING:`
  (also `typing.TYPE_CHECKING`), `if __name__ == "__main__":`, `@overload` (also `typing.overload`),
  `raise NotImplementedError`, a function whose body is `...` right after the colon of its
  signature (a `Protocol` method, an `@abstractmethod` stub: `def write(self, text: str) -> object: ...`,
  also with a wrapped signature or a `-> T` return; a `...` on the next line, a wrapped `if (`,
  `except (` or `with (` header and a lambda are not stubs), and a `case _:` arm whose only
  statement is `assert_never(name)` (also `typing.assert_never` and
  `typing_extensions.assert_never`) on the line below it. That arm is the one allowed way to close a
  `match` over every member of an enum or union: without a wildcard, coverage.py counts the jump out
  of the `match` when no case matches, which no test can take, and the finding for it says to end
  the `match` with `case _:` and `assert_never(subject)`. Nothing else is excluded: an
  `assert_never` in an `else`, one inside a longer expression, `case _: assert_never(x)` on one
  line, an argument that is not a name and a `case _:` arm with another statement are all counted.
  The type checker reports an `assert_never` it cannot prove unreachable, so a missing case still
  fails when the function is checked (mypy skips the body of an unannotated function), and an
  untested `case _:` that does something else is still reported. A branch of a function that legitimately cannot be tested is
  accepted with an `exceptions` entry for `changed-branch-coverage` that names the function
  (`"function": "Service.wide"`), which keeps every other finding of the file. Only a branch in no
  function (module-level code) is lifted with `exclude` in `nitpicker.config.json` (a path glob),
  which drops every finding for that file, not only this rule's. Test files are not measured, so a `.` source root does not gate them.
- **Tests.** `languages/python/ingest/coverage-reports/coverage-branches.test.mjs` (the ingester on a recorded
  coverage.py report, identity stability, baselined / touched / added cases through
  `compareFindings`); `core/command/python/python-cli-*.test.mjs` (the CLI with fake tools); the gated e2e test adds
  twelve cases on a real project (moved gap baselined, edited line fails, edited and tested passes,
  new untested branch fails while the old gap stays baselined, a pragma hides nothing, new tested
  branch passes, `Protocol` and abstract stubs pass, a `match` closed with `assert_never` passes,
  one with no wildcard fails naming that form, an untested `case _:` default fails, a `case _:` arm
  with a statement after `assert_never` fails, and a wrapped `if (` with a `...` body and an
  `else: assert_never(x)` both stay counted).
