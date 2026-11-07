# Style, names and secrets

Part of the [nitpicker-kotlin](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- detekt's defaults stay on. In main sources: lines of at most 120 characters, named constants
  instead of numbers other than -1, 0, 1 and 2 (`MagicNumber`), at most 2 `return` and 2 `throw`
  per function, conditions of at most 3 `&&`/`||` parts, no wildcard imports unless most of the project's files
  already use them, and no `TODO` or `FIXME` without an issue (`TODO(#123): ...`). Catch and throw specific exceptions, never `Exception`, `RuntimeException` or
  `Throwable` (also in tests: `TooGenericExceptionCaught`), and pass the caught exception on as the cause (`SwallowedException`). Use
  `require(...)` and `check(...)` instead of throwing `IllegalArgumentException` and
  `IllegalStateException`; a top-level `val` holding a literal is `const val`. Remove unused private
  members and parameters (an override, a function with a framework annotation and a name starting
  `ignored` or `unused` are skipped). A public function's `Boolean` parameter that picks a behavior
  becomes two functions or an enum (`BooleanFlagParameter`).
- Names and comments (`kotlin-source` rules): name packages, files and types for their job
  (`PriceRounding.kt`), never `Utils`, `Helpers`, `Managers`, `Common`, `Misc` or `Miscellaneous`,
  also not before `Mixin`, `Module` or `Base` (`HelperMixin`); a framework role such as
  `TransactionManager` is fine; pure logic shared between features goes in
  the shared package under such a name. Delete commented-out code, in tests too (`CommentedOutCode`);
  a sample under an `Example:` heading is fine.
- KDoc is optional. When you write it, say what the name cannot (a unit, a limit, an edge case or
  why), never only restate the name, and keep the description to 5 lines, tags and code blocks not
  counted (`doc-comment-content`).
- Secrets (nitpicker's own `kotlin-source` checks, not detekt): never put a secret literal in a
  `password`, `token`, `apiKey` or `secret` name, map entry or fallback (`?: "..."`, `getOrDefault`);
  read it from the environment or a secrets manager. Never pass a secret to a log call, `println`,
  `System.out`/`System.err` or an exception message: log that it is set, or a masked tail.
- A string of five characters or more used three times in a main file gets one
  `private const val NAME = "..."` (`kotlin-source/RepeatedStringLiteral`); annotation arguments,
  `when` labels, named arguments, map keys and message keys are not counted.
