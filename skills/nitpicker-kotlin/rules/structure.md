# Structure and dependencies

Part of the [nitpicker-kotlin](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- A function stays within 50 lines, 15 statements, 2 levels of control nesting and 3 parameters;
  past 3 parameters, pass a data class. Each lambda, anonymous function and local function is a function
  with the same limits, counted on its own and not towards the function around it; so are `init` blocks
  (`Class.<init>`) and property initializers that branch (`val y = if (...) ... else ...`). An `init` block cannot return early: move the nested part into
  a function. Complex code needs tests: the CRAP score of a function must
  stay below 9.
- Copied code fails (`duplicate-clone`), also when the copy has other names and literals: extract
  a function; in tests, a helper or one parameterized test. Smaller copies fail too: a top-level or `object` function or constant with the same code in two files of one module (`duplicate-definition`), and editing one of two near-identical copies while leaving the other (`sibling-copy-edit`); keep one and call it. Don't import two classes of one name into a file with `import ... as` (`exported-name-collision`): rename one. A package must not depend on a less stable one (`stability-direction`).
- A file stays within 300 lines (a test file 500). A package folder holds at most 6 files and 6
  test files directly: group the rest into subpackages by what they do. Java sources follow the
  `nitpicker-java` rules.
- With jMolecules (`AggregateRoot`, `Entity`, `ValueObject` or their annotations; also without Spring),
  the `archunit/ddd-...` rules hold aggregate boundaries: refer to another aggregate's root by its
  identifier or an `Association`, keep each entity in one aggregate, and keep entities and roots out of
  value objects.
