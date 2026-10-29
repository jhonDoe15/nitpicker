# Editing existing code

Read this when your change edits a function, class, file or package that existed before it.
Everything in `SKILL.md` still applies to the lines you add.

- A function already over a size limit may be edited but must not grow: the run notes the base
  value (`allowed because base was 64`) and fails any increase
  (`Big.process grew from 64 to 65 lines`). Changing or deleting lines is fine. Put new logic in a
  new function and call it once; to make room, extract the smallest existing block. Extracted code
  is new code and must meet every rule. Growing can also cross detekt's `LongMethod` (60 lines)
  or `NestedBlockDepth` (4).
- When an enum or sealed type gains an entry that a legacy `when` must handle and the function is
  over a limit, move the `when` into a new function and call it (`total += weight(kind)`); a branch
  added in place grows the function.
- Keep a legacy function's name. Renaming it makes all its limit, branch-coverage and
  `LongMethod` findings new. An overload with the same name added above it makes its limit
  findings new: add the overload below, or give it its own name.
- A function at detekt's `ReturnCount` or `ThrowsCount` limit (2) fails on one more `return` or
  `throw`. One already over the limit keeps its finding however many it gains, so hold its count
  yourself. Return the new failure from a new function and throw it by widening an existing
  `throw` in place: `if (y < 0 || x == y) { throw BadState(reason(y)) }`.
- A file, class or folder already over its limit must not grow: `File grew from 320 to 321 lines`,
  `Object Sprawl grew from 316 to 317 methods`, `Folder grew from 8 to 9 source files`. Put new
  code in a new class in its own file, and a new file in a subpackage. A folder at 6 files fails
  on the 7th.
- A function over the CRAP limit may be edited while its score holds; a new branch raises it
  (`CRAP rose from 114.74 to 137.24`). Put the branch in a new, tested function.
- Every line you touch needs 95% of its branches covered, even if it was uncovered before; adding
  a comment to the line counts as touching it. Lines you don't touch keep their baseline. Before
  you edit a branch line, add the test for the outcome no test reaches.
- An existing detekt finding stays baselined while its message is unchanged (numbers in it are
  ignored), also when you edit its line. Many messages name the property or function
  (``Private property `leftover` is unused``), so renaming it makes the finding new: fix it in the
  same change. Another finding of the same rule in the same file is new, and the report may place
  it on the legacy line.
- Moving a file to another package, or renaming the file, keeps its detekt, CRAP and size
  findings. After a package move, findings that name the class (`coupling/test-only-export`) count
  as new; a renamed file whose one top-level declaration keeps its name fails
  `MatchingDeclarationName`.
- Code jscpd reports as a legacy clone counts as a new clone once you add or remove lines inside
  it: make both copies call one function, or put the change outside the clone.
