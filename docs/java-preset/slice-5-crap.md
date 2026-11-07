# Slice 5: CRAP

Part of the [Java preset guide](../java-preset.md).

- **Complexity source.** `StructureMetrics.java` (the `nitpickerStructure` task, see
  [Structure limits (SH5)](structure-limits-sh5.md)) writes the
  cyclomatic complexity of each method and constructor into `structure.json` in the report directory
  (`complexity`), so the CRAP check needs no tool beyond the JDK that runs Gradle. It is
  McCabe's count: 1 plus each `if`, `for`, enhanced `for`, `while`,
  `do`, `catch`, `?:`, `&&`, `||` and each `case` that is not a default one (an arrow case and a case with
  several constants count once; `default` and `case null, default` count 0). A flat switch, a switch
  expression or a pattern switch whose cases are all one-expression arrows, counts as one decision
  plus one per `when` guard, at most its case count, so an exhaustive switch over an enum or sealed
  type does not push a method over the limit. Lambda bodies, initializer blocks and members of
  nested and anonymous classes are units of their own and do not count towards the enclosing
  method; the same scanner counts all of them (see
  [Structure limits (SH5)](structure-limits-sh5.md)).
- **Ingester.** `ingestCrap` (`languages/java/ingest/crap.mjs`) joins those methods with the JaCoCo
  report (same `jacoco.xml` as slice 1). A JaCoCo method belongs to a method of `structure.json` when
  the file, the method name (`<init>` is the class name) and the line match: the method's first line
  lies in the method's line range. This also joins methods of anonymous classes. A constructor is
  also joined by its parameter types (`parameterTypes` in `structure.json` against JaCoCo's
  descriptor), because a class with field initializers starts its `<init>` at the first initializer,
  before the constructor. A lambda is joined to the synthetic JaCoCo methods `lambda$<method>$<n>`
  (`lambda$new$<n>` in a constructor, an instance initializer or a field initializer,
  `lambda$static$<n>` in a static one) whose first line lies in the lambda's range and not in a lambda
  nested in it, so a lambda inside a lambda is scored separately and an outer lambda is scored
  without the inner one. An initializer block and a field initializer that branches (`entry.initializer`
  in `structure.json`) have no JaCoCo method of their own: their code is part of the constructors'
  `<init>` or of `<clinit>`, so their coverage is read from JaCoCo's per-line data (`jacoco.xml`
  `<sourcefile><line>`: covered lines and branches) for the lines of the unit, minus the lines of a unit nested in
  it, and the lower of the line and branch percentage is used as everywhere else. A constructor's
  own score still counts the initializer lines that its `<init>` holds.
- **Private empty constructors.** `private Util() {}` (also with an explicit `super();`), the
  utility-class idiom, is flagged `privateEmptyConstructor` in `structure.json` and left out of the
  join. JaCoCo leaves such a constructor out of its report only in some cases (inner classes, enums,
  classes with field initializers, and a superclass other than `Object`), so it would often be
  `crap-coverage-unknown`. Dropping it when JaCoCo does report it is harmless: its complexity is 1,
  which can never exceed the CRAP limit.
- **Rules, as in the TypeScript `crap` check.** `crap = ccn^2 * (1 - coverage)^3 + ccn`, where
  coverage is the lower of the method's JaCoCo line coverage and branch coverage (whichever have
  counters). `crap-score-limit` (enforceable) when `crap >= 9`: a method at exactly the limit
  fails, as it does for TypeScript; for a fully covered method the message says to split off a
  branchy part. `crap-coverage-unknown` (enforceable) when no JaCoCo method
  matches or the method has neither line nor branch counters; its Java message names the two causes,
  no test runs it or it carries an annotation whose name contains `Generated`.
- **JaCoCo filters.** The project's own JaCoCo settings (`jacocoTestReport.classDirectories`
  excludes, `test.jacoco` includes and excludes) are reset, so a class cannot leave the coverage
  report through `build.gradle`. JaCoCo still skips a class or method carrying an annotation whose
  name contains `Generated` (`@ExcludeFromJacocoGeneratedReport` too), and PIT skips `@Generated`,
  `@DoNotMutate` and `@CoverageIgnore`. An
  annotation whose value names a known generator (MapStruct, Dagger, AutoValue, Immutables and the
  others the generated-sources check lists) makes the whole file generated, so its findings are
  dropped and no `pmd/GeneratedOnHandWrittenCode` is reported; adding one to a file the base checked
  is a policy loosening. Any other such annotation is the `pmd/GeneratedOnHandWrittenCode` finding
  (also JPA `@GeneratedValue` on a getter: put it on the field), and `@DoNotMutate` or
  `@CoverageIgnore` is `pmd/MutationIgnoreMarker`.
  Only violations are findings; the
  per-function metric findings of the TypeScript check are not produced.
- **Identity.** `function:<signature>`, for example `function:Calc.classify(int, int, String)`:
  enclosing classes, method and parameter types (`signature` in `structure.json`), never a line;
  a lambda is `function:Calc.classify.<lambda>` or `function:Calc.classify.callback` (named after the
  variable it initializes), an initializer block `function:Calc.<clinit>` (static) or
  `function:Calc.<init>`, a field initializer `function:Calc.LIMIT`.
  Repeats (anonymous classes) get `#2`, `#3` in report order. The `<init>`, `<clinit>` and `<lambda>`
  names repeat within a class by nature, so a finding on one is numbered only among the entries of
  that name with the same source text that are over the limit: inserting, deleting or reordering other
  blocks or lambdas never turns a legacy one into a new finding. A file
  renamed or moved to another package keeps its findings: the comparison maps base paths through
  git's renames. The size and CRAP ratchets are keyed by the method's name, so a method that gains a
  parameter keeps its legacy values and fails only on growth; renaming the method, or adding an
  overload of the same name above it, makes them new (#548).
- **Tests.** `languages/java/ingest/crap.test.mjs` against the committed samples
  `fixtures/structure.json` and `fixtures/jacoco-crap.xml`; `java-reports.test.mjs` covers the glue;
  the gated e2e test has a case adding a ten-branch untested method.
