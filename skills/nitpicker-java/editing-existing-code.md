# Editing existing code

Read this when your change edits a method, class, file or package that existed before it.
Everything in `SKILL.md` still applies to the lines you add.

- A method already over a size limit may be edited but must not grow: the run notes the base value
  (`allowed because base was 66`) and fails any increase (`Big.process grew from 66 to 67 lines`).
  Changing or deleting lines is fine. Put new logic in a new method and call it once; to make
  room, extract the smallest existing block. A `case` added to a legacy `switch` grows it too: move
  the switch into a new method with an exhaustive `switch` expression and call that.
- Extracted code is new code and must meet every rule. PIT keys a mutant by its method, so the
  moved lines' surviving mutants count as new: test the new method with exact values
  (`assertEquals(4, Big.combine(1, 2, 3))`).
- Keep a legacy method's name and parameters. Renaming it or its class makes all its limit,
  branch-coverage and surviving-mutant findings new; adding a parameter makes all its surviving
  mutants new. An overload with the same name added above it makes its limit findings new: add it
  below, or give the new method its own name.
- A file, class or folder already over its limit must not grow: `File grew from 320 to 321 lines`,
  `Class Sprawl grew from 314 to 315 methods`, `Folder grew from 8 to 9 source files`. Put new code
  in a new class, and a new class in a subpackage. A folder at 6 files fails on the 7th.
- A method over the CRAP limit may be edited while its score holds; a new branch raises it
  (`CRAP rose from 114.74 to 137.24`). Put the branch in a new, tested method.
- Every line you touch needs 95% of its branches covered, even if it was uncovered before; adding
  a comment to the line counts as touching it. Lines you don't touch keep their baseline. Before
  you edit a branch line, add the test for the outcome no test reaches.
- An existing PMD, Error Prone or Checkstyle finding stays baselined while its message is
  unchanged, also when you edit its line. Many messages name the field, method or class, so
  renaming that symbol makes its findings new: fix them in the same change. Another finding of the
  same rule in the same file is new, and the report may place it on the legacy line.
- Moving a file to another package keeps its PMD, Error Prone, CRAP, size and mutation findings;
  its Checkstyle findings and those that name the class (`coupling/test-only-export`) count as new.
  Don't move or rename a file the task doesn't need moved.
- Code jscpd reports as a legacy clone counts as a new clone once you add or remove lines inside
  it: make both copies call one method, or put the change outside the clone.
