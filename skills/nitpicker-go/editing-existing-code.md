# Editing existing code

Read this when your change edits a function, type, file or package that existed before it.
Everything in `SKILL.md` still applies to the lines you add.

- A function already over a size limit (lines, statements, nesting, parameters) may be edited but
  must not grow: the run notes the base value (`allowed because base was 56; any increase fails`)
  and fails any increase (`Process grew from 56 to 57 lines`, `grew from 4 to 5 parameters`).
  Changing or deleting lines is fine. Add one call to a new function and put the new code there;
  the new function may sit above or below the legacy one. The call costs a line and a statement
  too, so make room by extracting the smallest existing block. Extracted code is new code and must
  meet every rule. To pass a function over 3 parameters a new value, add a field to a struct it
  already takes, or let the caller compute it.
- Keep a legacy function's name, and keep it in its file. Renaming it, or cutting it into another
  file, makes all its limit findings new, at full size (`ProcessItems has 56 lines; limit is 50`).
  `git mv` of a whole file with small edits keeps its size, line and vet findings, also into
  another package. A legacy slow test that moves to another package counts as changed.
- A function literal is named by its position (`Report.func1`, `Report.func2`). A new literal
  added above a legacy one renumbers it, and that one's findings count as new: add the new literal
  below the existing ones, or make it a named function.
- A type, struct, file or folder already over its limit must not grow either:
  `Struct Cart grew from 21 to 22 methods`, `grew from 11 to 12 fields`,
  `File grew from 325 to 329 lines`. Methods count across the package's files, so a method in a
  new file still grows the type: put the new methods on a new type, the new field in a struct of
  its own, new code in a new file, and a new file in a new package. A folder at 6 source files
  fails on the 7th (`Folder has 7 source files directly in it`); test files are counted separately.
- A line over 120 characters (string text, URLs and imports aside) may be edited while it gets
  no longer (`Line grew from 141 to 145 characters`). Break it up when you need to add to it.
- A `vet` finding is matched by its message and the text of its line. Any edit of that line, even
  a trailing comment, makes it new: fix the call when you touch it. A copy of the legacy line, or
  any other vet finding, is new too.
- Run the formatter only over a file that was formatted before your change. The format finding of
  an unformatted file is held while you edit it, but a formatter run rewrites its lines, and a vet
  finding on a rewritten line counts as new (`fmt.Printf("%d",   "x")` becoming
  `fmt.Printf("%d", "x")`). Write your own lines in the formatter's style anyway.
- Editing a legacy test makes it a changed test, held to the slow-test budget even if it was
  slow before (`TestSlowLegacy took 6.0 s; a unit test may take 5 s`). Remove its wait in the same
  change, or leave the test alone.
