# Tests that copy a constant

A string or number literal in a test that equals a production constant the test can see is an
enforceable `pmd/CopiedConstantInTest` finding
(`languages/java/adapters/review-rules/copied-constants/`), in the Java and Kotlin presets alike.
When the constant changes, a test that holds a copy of its value keeps checking the old value, or a
boundary test (`isValid("x".repeat(65))` next to `MAX_LENGTH = 64`) stops testing the boundary.
The rule prints as a PMD rule like the other test honesty rules, but nitpicker computes it over the
sources of every module, because the constants live in other files than the tests.

- **Constants:** a non-private `static final` field or an interface field of a main-source class, and
  in Kotlin a non-private `const val` or `val` at top level, in an `object` or in a `companion object`,
  whose name is `UPPER_SNAKE` and whose initializer is one string literal (no template) or one number
  literal, negative numbers included. Numbers compare by value, so `5_000L` matches `5000`.
- **Seen by a test:** the test names the owner class (`Limits`) and the owner is in the test's package
  or imported (single-type, on-demand or with an alias), or the test imports the constant itself
  (`import static shop.Limits.MAX_ITEMS`, `import shop.Limits.MAX_ITEMS`). A Kotlin top-level
  constant is seen by a Kotlin test in its package or one that imports it or its package.
- **Not reported:** the numbers -1, 0, 1 and 2 and strings shorter than 3 characters; a literal whose
  statement names the constant (`assertEquals(50, Limits.MAX_ITEMS)` pins a value that is a contract,
  which is the allowed form); annotation arguments; test names (the first argument of `test`, `it`,
  `describe`, `should`, `dynamicTest` and the other spec builders, and a Kotest name before `{`);
  Kotlin string templates (a `$` in a Java string is plain text), text blocks and raw strings;
  constants of test sources; files under `exclude`. The Kotlin `expect(50) { ... }` of `kotlin.test`
  is an assertion, so its first argument is checked.

The message names the constant and its file, says to use the name (`Limits.MAX_LENGTH + 1`) and
names the pin form, and ends with the exception sentence for
`{ "rule": "pmd/CopiedConstantInTest", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/copied-constants/copied-constants.test.mjs`.
