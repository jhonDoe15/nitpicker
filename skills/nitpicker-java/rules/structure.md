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
  other (`sibling-copy-edit`). Keep one and call it. A method or constructor proved to copy
  another (`near-duplicate`: the same tree apart from renamed locals, up to 4 changed values or
  types, a shared run of 3 or more statements, or the same logic written another way, such as a loop and the call that replaces it) fails too: extract one method with the changed
  values as parameters. A condition that the guards before it already decide (`decided-condition`:
  `if (n > 20)` after `if (n > 10) return`) fails: remove it, or fix the condition you meant. Two arms of an `else if` chain or two `switch` cases with the same body (`duplicate-branch`) fail: merge them. Don't give two classes one name and use both in
  one file, one fully qualified (`exported-name-collision`): rename one.
- A main class only tests use belongs in the test sources (`coupling/test-only-export`).
- Read environment variables and system properties (`System.getenv`, `System.getProperty`, `Integer.getInteger`,
  `Long.getLong`, `Boolean.getBoolean`) once in the composition root: the class with `main`, a Guice or Dagger
  module, a CDI producer or Micronaut `@Factory`, or the framework's typed configuration (Spring or Micronaut
  `@ConfigurationProperties`, Quarkus `@ConfigMapping`). Put the values in a record and pass it in through
  constructors (`pmd/ConfigurationReadOutsideCompositionRoot`; with Spring, `SpringTypedConfiguration`). JVM keys
  such as `java.*` and `user.*` are fine.
- A class in a `shared` package that only one feature (a package under `features`) uses belongs in
  that feature (`coupling/shared-used-by-one-feature`); `layout.sharedRoots` and
  `layout.featureRoots` name other folders.
- Features (`**/features/<name>`, or in a Spring app the sub-packages of the root package): other
  code uses only the classes directly in a feature's package, never its sub-packages
  (`feature-internal-import`), and never another feature's entities or repositories
  (`foreign-feature-persistence`): call its services. `shared` never uses a feature
  (`shared-imports-feature`); features and packages never depend on each other in a cycle
  (`feature-cycle`, `package-cycle`).
- Code in a package with a `domain` segment holds rules only: no adapter, file, network, thread,
  database, HTTP, messaging, logger, random or container class, also not through a helper
  (`domain-imports-*`, `domain-reaches-io`). Declare an interface (port) in the domain, implement it
  in an adapter, and pass ids, clocks and values in.
- With jMolecules (`AggregateRoot`, `Entity`, `ValueObject` or their annotations), an aggregate holds
  another aggregate only by its identifier or an `Association<T, ID>`, an entity sits in one
  aggregate, and a value object holds identifiers, not entities (`archunit/ddd-...`).
- Dependencies between packages follow the project's ArchUnit rules (classes named `*ArchTest` or
  `*ArchitectureTest`); read them before importing across packages. A package must not depend on a
  less stable one (`stability-direction`).
