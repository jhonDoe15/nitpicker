# Copy-pasted tests

Three or more test methods of one class whose bodies are the same once literals are ignored are an
enforceable `pmd/CopyPastedTest` finding (`languages/java/adapters/review-rules/copy-pasted-tests/`),
in the Java and Kotlin presets alike. It is the counterpart of `nitpicker/no-copy-pasted-tests` of the
TypeScript preset. A copy per case hides which value is the case and makes a new case a copy-paste; a
table has one row per case and one body to read. The rule prints as a PMD rule like the other test
honesty rules, but nitpicker computes it over the test sources of every module.

- **Tests:** a method annotated `@Test` (JUnit 4, JUnit 5 and TestNG, with a block body or, in
  Kotlin, an expression body) and, in Kotlin, a Kotest case written `test("name") { ... }`,
  `it("name") { ... }`, `should("name") { ... }` or `"name" { ... }`.
- **Same body:** the tokens of the bodies are equal once every string, number, character, boolean
  and `null` literal is replaced by one placeholder, and a minus sign in front of a number counts
  as part of the number. Names, comments and layout do not count. Tests are compared inside one
  class (or one Kotest block).
- **Reported:** the third copy and every later one, with the number of others it repeats.
- **Allowed:** `@ParameterizedTest` with `@CsvSource` or `@MethodSource`; TestNG
  `@Test(dataProvider = "...")` with a `@DataProvider`; Kotest `withData`. Two tests whose bodies
  differ in a call, a variable or a statement are not copies, and neither are two copies alone.
- **Not reported:** files under `exclude`.

The message names the table form of the language and ends with the exception sentence for
`{ "rule": "pmd/CopyPastedTest", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/copy-pasted-tests/copy-pasted-tests.test.mts`.
