# Structure limits (SH5)

Part of the [Java preset guide](../java-preset.md).

- **Rules.** The shared structure rule (`shared/rules/structure.mjs`) runs on Java too, so a method
  over 50 lines, 15 statements, control nesting 2 or 3 parameters fails with the same rule ids
  (`function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`,
  `function-parameters-limit`) and the same messages (`{name} has {value} {metric}; limit is
{limit}`, and for nesting `{name} nests control flow {value} deep (limit {limit})`) as TypeScript, followed by the `exceptions` entry that accepts the method (`If this is intended, add {...} to
"exceptions" in nitpicker.config.json.`). `shared/policy.mjs` marks the four rules as enforced for Java; the
  catalog in `spec/checks.md` is generated from it.
- **Metric source (decision to review).** `languages/java/gradle/StructureMetrics.java` parses the main sources
  (parse only, no compilation) with the JDK's compiler tree API (`jdk.compiler`) in single-file
  source mode, run by the JVM that runs Gradle (task `nitpickerStructure`, report
  `structure.json` in the report directory). It needs no dependency and no pin beyond the JDK. A syntax error (for
  example syntax newer than the JVM that runs Gradle) is not skipped: the program prints `file:line` and
  the compiler message of up to five errors and exits with status 1, so the task fails and the run is a
  tool error instead of a report with missing or shortened methods. All four
  metrics come from this one source so they are consistent (the cyclomatic complexity of the CRAP check
  too); a second tool would make two counters disagree. PMD's metrics were rejected (not in the SARIF output, and
  its rules do not expose per-method statements). A small JavaParser step was the alternative; it would add a
  pinned artifact for nothing the JDK does not already provide.
- **Definitions** (the TypeScript analyzer's, so both languages gate the same way). Unit: each
  method and constructor with a body, each static and instance initializer block with a statement
  (`Class.<clinit>`, `Class.<init>`), each field initializer that is a lambda (`Class.field`) or
  branches (`?:`, `&&`, `||`, a `switch` expression) and each lambda (`Class.method.<lambda>`; one
  assigned to a variable or field is named after it, one inside another unit is named after that unit,
  as in `Class.method.<lambda>.<lambda>`), as every arrow function and callback is in TypeScript. `lines`: last line - first line + 1, annotations and
  modifiers included, Javadoc not. `statements`: every statement in the body except blocks (`for`
  initializers and updates, `catch` parameters and `try` resources are not statements).
  `maxControlNesting`: deepest nesting of `if`, `for`, enhanced `for`, `while`, `do`, `switch`
  (statement or expression) and `catch`; an `else if` stays on the level of the `if` it continues,
  as in the Python and Kotlin presets. `parameters`:
  declared parameters (the parameters of the lambda). Anonymous, local and member class bodies,
  lambdas and initializer blocks are separate units and do not count towards the method that
  contains them: the statements, control nesting and complexity of a lambda are its own, as in
  TypeScript (`lines` is the physical span, so the lines of a nested unit still count towards the one
  around it). A lambda with an expression body has 1 statement. A field initializer unit has 1 statement.
- **Findings.** `languages/java/adapters/metrics/java-structure.mjs` hands the metrics to `evaluateStructure` and keeps
  the enforceable limit findings only (tool `structure`); the per-method descriptive metrics of the
  TypeScript check are not emitted, since they would add four findings per method to every report.
  Name: `Outer.Inner.method` (constructors use the class name; anonymous classes `<anonymous>`;
  initializer blocks `Outer.<clinit>` and `Outer.<init>`, lambdas `Outer.method.<lambda>`),
  identity: name, occurrence among equal names in the file and a hash of the method text with
  indentation removed, no line number. A moved or re-indented method stays baselined; editing a
  method that already violates produces a new finding, as in TypeScript.
- **Cache invalidation.** `StructureMetrics.java`, `java-structure.mjs`, `structure-report.mjs` and the shared structure
  rule files are in the Java analyzer's configuration hash.
- **Tests.** `java-structure.test.mjs` (fast: limits, messages, identity stability);
  the gated e2e adds a branch with a method over the parameter limit (fails) and keeps a legacy
  oversize method baselined.
