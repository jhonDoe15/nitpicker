# Structure and dependencies

Part of the [nitpicker-java](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- A method in main sources: at most 50 lines, 15 statements, control nesting 2, 3 parameters. Each lambda and each static or instance
  initializer block is a unit with the same limits, counted on its own and not toward the method around it. Return early instead of nesting; past 3 parameters, pass a `record`.
- A file: at most 300 lines (test file 500). A folder: at most 6 source files and, separately, 6
  test files directly in it; group the rest into sub-packages.
- Keep classes small: split by responsibility and prefer holding a collaborator to extending one.
- Cyclomatic complexity 9 or more fails `crap-score-limit` even when fully covered; less
  coverage lowers the ceiling (`ccn^2 * (1 - coverage)^3 + ccn < 9`). Split branchy methods.
- Copied code fails (`duplicate-clone`), also when the copy has other names and literals: extract
  a method; in tests, a helper or one `@ParameterizedTest`.
- Smaller copies fail too: a static helper or a constant with the same code in two classes of one
  module (`duplicate-definition`), and editing one of two near-identical copies while leaving the
  other (`sibling-copy-edit`). Keep one and call it. Don't give two classes one name and use both in
  one file, one fully qualified (`exported-name-collision`): rename one.
- A main class only tests use belongs in the test sources (`coupling/test-only-export`).
- With jMolecules (`AggregateRoot`, `Entity`, `ValueObject` or their annotations), an aggregate holds
  another aggregate only by its identifier or an `Association<T, ID>`, an entity sits in one
  aggregate, and a value object holds identifiers, not entities (`archunit/ddd-...`).
- Dependencies between packages follow the project's ArchUnit rules (classes named `*ArchTest` or
  `*ArchitectureTest`); read them before importing across packages. A package must not depend on a
  less stable one (`stability-direction`).
