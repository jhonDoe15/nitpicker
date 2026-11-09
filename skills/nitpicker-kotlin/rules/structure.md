# Structure and dependencies

Part of the [nitpicker-kotlin](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- A function stays within 50 lines, 15 statements, 2 levels of control nesting and 3 parameters;
  past 3 parameters, pass a data class. Each lambda, anonymous function and local function is a function
  with the same limits, counted on its own and not towards the function around it; so are `init` blocks
  (`Class.<init>`) and property initializers that branch (`val y = if (...) ... else ...`). An `init` block cannot return early: move the nested part into
  a function. Complex code needs tests: the CRAP score of a function must
  stay below 9.
- A new clone of at least 5 lines and 50 tokens in main sources (`duplicate-clone`) fails: extract
  a function, also when the copy has other names and literals. Smaller copies fail too: a top-level or `object` function or constant with the same code in two files of one module (`duplicate-definition`), and editing one of two near-identical copies while leaving the other (`sibling-copy-edit`); keep one and call it. Don't import two classes of one name into a file with `import ... as` (`exported-name-collision`): rename one. A package must not depend on a less stable one (`stability-direction`).
- A file stays within 300 lines (a test file 500). A package folder holds at most 6 files and 6
  test files directly: group the rest into subpackages by what they do. Java sources follow the
  `nitpicker-java` rules.
- With jMolecules (`AggregateRoot`, `Entity`, `ValueObject` or their annotations; also without Spring),
  the `archunit/ddd-...` rules hold aggregate boundaries: refer to another aggregate's root by its
  identifier or an `Association`, keep each entity in one aggregate, and keep entities and roots out of
  value objects.
- A project exception a Spring controller can throw maps to a status: an `@ExceptionHandler` for it (or
  a base class) in a `@RestControllerAdvice`, or `@ResponseStatus` on the class
  (`archunit/spring-unmapped-exception`).
