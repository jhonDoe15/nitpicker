# Style, names and Javadoc

Part of the [nitpicker-java](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Style is google-java-format, 100 columns, unless the project formats with palantir-java-format
  (120 columns, 4 spaces). Indent like the files around you (nitpicker follows the project's
  formatter and majority, 2 spaces or 4 with `--aosp`); a misformatted file is one finding, so let
  `npx nitpicker --fix` format it rather than fixing layout by hand. With no formatter, nitpicker still reports unused
  imports and bad indentation or whitespace; in a tab-indented project it checks neither tabs nor
  indentation.
- Names and declarations: abbreviations are words (`parseUrl`, `HttpClient`, `userId`, never
  `parseURL`). Declare a local next to its first use, one variable per declaration, and keep
  overloads next to each other. Mark overrides `@Override`. Never reassign a loop variable, and
  never call `System.exit`. A trailing array parameter is varargs (`String... names`).
- Literals: compare against named constants (`quantity >= BULK_THRESHOLD`), not literals in an
  `if`; `-1`, `0`, `1` and `2` are fine.
- Parameters and loops: never reassign a parameter or a catch variable; copy to a local. Use
  for-each where the index is unused. Remove unused fields, locals, private methods, assignments.
  Wait for a task that uses a resource inside its try block, after starting it and not under an `if` or loop
  (`get()`/`join()`, `awaitTermination`, `take()`, a latch `await()`, or declare the executor as a later
  resource); `pmd/TaskOutlivesTryResource` reports a task that can outlive the close.
- Boolean logic in its shortest exact form: `return a == b;`, not an `if` that returns `true` or
  `false`; `ready` and `!ready`, not `ready == true`; `c || x` and `c && x`, not a ternary with a
  `true` or `false` branch; `a != b`, not `!(a == b)`; one `if (a && b)`, not an `if` alone inside
  another; `x instanceof Foo` with no null check before it; `if (c) A else B`, not
  `if (!c) B else A` (and `c ? b : a`, not `!c ? a : b`); `!(a || b)`, not `!a && !b`. These stay:
  `if (a != b)` with an else, an else-if chain, and `!(a < b)` on a `float` or `double` (NaN).
- Utility classes: a `final` class of static methods with a `private` empty constructor.
- Javadoc is optional; when you write it, the first sentence is a real summary (not `@return`),
  every `@param`/`@return` has a description, in that order, and paragraphs start with `<p>`.
  It says what the name cannot (a unit, a limit, an edge case or why), never only restates the
  name, and keeps the description to 5 lines, tags and `<pre>` blocks not counted
  (`doc-comment-content`).
- nitpicker runs its own PMD rules (errorprone, bestpractices, performance, multithreading,
  security, a broad-catch rule, the boolean simplification rules and its own guard rules),
  forbiddenapis, javac lint and Google checks. A project's `config/pmd/ruleset.xml` or
  `config/checkstyle/checkstyle.xml` counts only when `nitpicker.config.json` opts in under
  `tools`; then read it too.
