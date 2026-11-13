# Slice 1: tools, reports and identities

Part of the [Java preset guide](../java-preset.md).

Identity is how a finding is matched between base and head. It never contains a line number, so a
finding that only moves stays baselined. The comparison key is already
`tool, rule, path, symbol, identity, classification, metric name`; "identity" below is what each
tool adds on top of rule and path.

| Tool                                                                             | Report                     | Ingester                                                    | Classification                                          | Identity                                                                                                            |
| -------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| PMD (`pmd`)                                                                      | SARIF 2.1.0                | `ingestSarif` (X5), after URI rewriting                     | enforceable: every reported violation                   | The rule's message text (PMD names the offending field, method or variable in it). Repeats get `#2`, `#3` in order. |
| SpotBugs (`spotbugs`)                                                            | SARIF 2.1.0                | `ingestSarif` (X5), after URI rewriting                     | enforceable: every reported bug                         | SpotBugs' message arguments (class, method or field, called method). Repeats get `#2`, `#3` in order.               |
| google-java-format (`google-java-format`; `palantir-java-format` for that style) | file list from `--dry-run` | `ingestFormatCheck` (new, `shared/ingest/format-check.mjs`) | enforceable                                             | The constant `format`; the file path is the key. One finding per unformatted file.                                  |
| JaCoCo (`jacoco`)                                                                | XML                        | `ingestJacoco` (X6)                                         | descriptive: `line-coverage` metric, `uncovered-method` | As in X6: class and method name plus descriptor.                                                                    |

Notes on the glue in `java-reports.mts`:

- **Paths.** PMD writes absolute `file://` URIs; SpotBugs writes paths relative to a source root
  (`demo/Bad.java`); JaCoCo writes package-relative paths. All become project-relative
  (`src/main/java/demo/Bad.java`). `manifest.json` lists the project's source roots, and a relative
  report path is attached to the root where the file exists.
- **Identity injection.** Neither tool emits `partialFingerprints`. The glue sets one
  (`nitpicker/subject`) from the message text (PMD) or message arguments (SpotBugs), so the SARIF
  ingester's `fp:` identity path is used and the line is never involved. The alternative, the
  ingester's default hash of rule, path and symbol, would treat two different unused fields in one
  file as indistinguishable repeats; matching by what the finding is about is more precise.
- **Several projects.** Each Gradle project's reports are read on their own and their findings
  joined. A finding about a whole project (path `.`, such as the mutation summary) gets
  `@<project path>` appended to its identity when the build has more than one project.
- **SpotBugs entity associations.** `EI_EXPOSE_REP` and `EI_EXPOSE_REP2` are dropped for a field
  annotated `@ManyToOne` or `@OneToOne`: an entity hands out its associated entity on purpose.
  Collections and other mutable values still fail, and the message names the copy (`List.copyOf`,
  `Map.copyOf`) or a record, and the exception.
- **SpotBugs level.** SpotBugs marks lower-confidence findings with SARIF level `note`, which the
  SARIF ingester would classify as report-only. The preset instead fixes the threshold in the init
  script (`-medium`) and treats everything the tool reports as enforceable.
- **Sources of weakness.** Identity from message text breaks if a tool version changes a message
  (pinned versions make this a deliberate bump, and the bump shows up as old findings resolved and
  new ones appearing, which the gate then flags: re-baseline on a tool bump). Hashed identities
  (JaCoCo, Checkstyle, SARIF hash fallback) include the path, so the rename map from git cannot
  remap them: a renamed file with such findings shows them as resolved plus new. `format` and
  `fp:` identities carry no path, so they follow renames.

**The project's PMD ruleset.** With `tools.pmd.precedence` listing `"project"`, PMD runs
nitpicker's ruleset and the project's together, on Gradle and Maven alike
(`adapters/tool-config/pmd-layers.mjs`). A rule the project names on its own, or defines inline,
is laid over nitpicker's definition of the rule: nitpicker's copy is excluded and the merged rule goes into
the project's ruleset file (PMD keeps the first reference of a rule, and a ruleset's `exclude-pattern`
applies to the file that holds it), so the project's priority, message and named properties win while the
properties it leaves unset keep nitpicker's values (xpath, `violationSuppressXPath`, `ignore...`). A
whole-category reference enables the rules nitpicker leaves out of that category (as single `<rule ref>`
entries, minus the project's `<exclude>`s) and nothing nitpicker already runs, and an `<exclude>` in the
project's file cannot turn a nitpicker rule off. With `["nitpicker", "project"]` nitpicker's values win
where both set one. A rule nitpicker runs through its test-only ruleset (`TestClassWithoutTestCases`, from
`pmd-test-ruleset.xml`) is never added to the project's file, so a project category reference does not run
it a second time; a project rule that names it is overlaid on that ruleset (`pmd-test-rules.xml`) instead.
The main-only ruleset (`pmd-main-ruleset.xml`, which holds the `security` category) works the same way: a
project reference to `category/java/security.xml` adds nothing, and a project rule that names one of its
rules is overlaid on it (`pmd-main-rules.xml`) and still runs on main sources only.

**Additional PMD categories (7.16.0).** The shared ruleset also runs the `performance` and
`multithreading` categories on main and test Java sources, and `pmd-main-ruleset.xml` runs the
`security` category on main sources only, since a test encrypts with a fixed key and IV to check known
output. Both hold with Gradle and Maven and for the Java sources of the Kotlin preset. Performance
rules cover redundant string allocation and conversion, builder appends, array copies, collection
conversion and `Files` streams instead of `FileInputStream`/`FileOutputStream`. Multithreading rules
cover `synchronized`, thread groups, calling `Thread.run()` directly, unsafe singleton publication,
shared formatters and `wait`/`notify`. `synchronized` is not allowed because the preset has one
locking style, a private final `ReentrantLock` taken right before `try` and released in `finally`
(with a `Condition` in place of `wait`/`notify`), not for performance: since JDK 24 a virtual thread
no longer pins its carrier inside `synchronized` (JEP 491). Security rules find hardcoded
cryptographic keys and IVs in main code; a constant IV that decrypts an existing format takes a path
exception. Each rule's message names the one allowed form and ends with the exception route.

Four rules of these categories are narrowed where their default flags code that has no other form
(see "PMD rules tuned by nitpicker" below).

Six rules of these categories are left out, each with its reason next to it in `pmd-ruleset.xml`:

| Category       | Excluded rule                         | Reason                                                                           |
| -------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| performance    | `AvoidInstantiatingObjectsInLoops`    | A loop that needs a distinct object per item is correct; hoisting changes it.    |
| performance    | `TooFewBranchesForSwitch`             | A small exhaustive switch is valid.                                              |
| performance    | `InsufficientStringBufferDeclaration` | A capacity hint is a micro-optimization; asking for one only adds magic numbers. |
| multithreading | `AvoidUsingVolatile`                  | `volatile` is a valid visibility primitive.                                      |
| multithreading | `DoNotUseThreads`                     | The J2EE container restriction does not apply to most applications.              |
| multithreading | `UseConcurrentHashMap`                | A `Map` declaration does not show concurrent access.                             |

A project that wants one of them back names it in its own ruleset (`tools.pmd.precedence`, above).
The reverse does not work: an `<exclude>` in the project's ruleset cannot turn off a rule nitpicker
runs; keep code a rule flags with a path exception or an entry under `exceptions` in
`nitpicker.config.json`.

**The project's SpotBugs settings.** SpotBugs has no config file of its own: a project sets it up in
its build, with the `com.github.spotbugs` Gradle plugin (`spotbugs { excludeFilter = file(...);
effort = ...; reportLevel = ... }`) or `spotbugs-maven-plugin` (`<excludeFilterFile>`, `<effort>`,
`<threshold>`). With `tools.spotbugs.precedence` listing `"project"`, nitpicker reads those
declarations from the head checkout's build files (`adapters/tool-config/declared/`, see
[Settings the build declares](../usage.md#settings-the-build-declares-java-and-kotlin-presets)) and
runs its own pinned SpotBugs with them, on Gradle and Maven alike and on the Kotlin preset's Java
classes: every exclude filter is passed as `-exclude`, and a higher effort or a lower threshold
replaces `-effort:default` and `-medium` unless `"nitpicker"` comes first. The exclude filter is
the project's list of reviewed suppressions, so it applies as the project's Checkstyle
`SuppressionFilter` files do, and an edit of it is a policy change. Settings that would drop findings
of the detectors nitpicker runs are never applied: a lower effort, a higher threshold, an include
filter, `onlyAnalyze`, `visitors`, `omitVisitors` and a baseline file; the run names the ones it left
out. Everything SpotBugs reports stays enforceable, the lower-confidence findings a `low` threshold
adds included.

**The project's Error Prone flags.** A project sets Error Prone up in its build too: the
`net.ltgt.errorprone` Gradle plugin (`options.errorprone { disable(...); option(...) }`, its
`nullaway { }` extension, `errorproneArgs`) or the `-Xplugin:ErrorProne ...` argument of
`maven-compiler-plugin`. With `tools.errorprone.precedence` listing `"project"`, nitpicker reads those
flags from the head checkout and appends them to the plugin argument its runner builds from
`checks.json`, after nitpicker's own flags, on Gradle and Maven alike and for the Kotlin preset's Java
sources (Error Prone takes the last flag for a check or an option, which the e2e test checks). The
flags are normalized first: a check the project turns on runs as a warning like every other check,
under every ordering when nitpicker leaves the check at Error Prone's default, and only with the
project first when `checks.json` turns it off; a check nitpicker already runs is left alone. A
project never turns a check off, sets NullAway's severity (nitpicker runs it on main code and turns it
off in tests), replaces the packages nitpicker measures, or narrows NullAway; NullAway's annotation
lists are joined with nitpicker's, NullAway options that only add findings apply, and `excludedPaths`
(several declarations become one alternation) applies like the SpotBugs exclude filter when it leaves
the `src/main` sources checked. The run names every flag
it left out. Findings of the checks the project adds go through the same messages, exemptions and
`exceptions` as nitpicker's.

**The project's PIT settings.** With `tools.pit.precedence` listing `"project"`, nitpicker reads the
`pitest { }` block of the `info.solidsoft.pitest` Gradle plugin or the configuration of `pitest-maven`
from the head checkout and passes the settings to its own PIT run (`nitpickerPit<Task>` on Gradle,
`runPit` on Maven, and the Kotlin preset's PIT run, whose Kotlin mutants stay descriptive). Excluded
classes, methods and test classes, the calls to avoid (after PIT's own logging classes) and the JVM
arguments are added under every ordering that lists `"project"`, like the SpotBugs exclude filter. A
timeout longer than PIT's default applies under every ordering, a shorter one never (a timed-out
mutant counts as killed). The project's mutators are added to the mutators nitpicker names itself (its `--mutators` list is
always passed), and its `threads` replace nitpicker's 2, only with the project first. The targets, the test classes, `features`, groups,
reports, thresholds and history stay nitpicker's; the run names what it left out.

**PMD rules tuned by nitpicker.** These rules of the rule set allow a narrower form than PMD's
default, and their messages name it:

| Rule                               | What passes                                                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AvoidLiteralsInIfCondition`       | `-1`, `0`, `1` and `2`, and any string or char literal (`"abc".equals(s)`); any other number in a condition is a named constant.                                                                   |
| `AvoidFieldNameMatchingMethodName` | `static final` constants, and a method named exactly like its field with at most one parameter: an accessor (`name()`), a fluent setter or builder step (`name(String)`).                          |
| `AssignmentInOperand`              | An assignment in a `while` condition (`while ((line = reader.readLine()) != null)`).                                                                                                               |
| `GuardLogStatement`                | `trace` and `debug` (and JUL `fine` levels) with placeholders whose values are variables, fields, literals or a no-argument call on one (`order.id()`); a guard only when an argument is computed. |
| `LogStringConcatenation` (new)     | `info`, `warn` and `error` with placeholders, for SLF4J, Log4j 2, commons-logging, JUL and `System.Logger`.                                                                                        |
| `GeneratedOnHandWrittenCode` (new) | No annotation whose name contains `Generated` on a class, method or constructor (JaCoCo skips them all, PIT skips `@Generated`); put JPA `@GeneratedValue` on the field.                           |
| `MutationIgnoreMarker` (new)       | No `@DoNotMutate` or `@CoverageIgnore`: PIT does not mutate what they mark.                                                                                                                        |
| `DontCallThreadRun`                | `super.run()` inside a `Thread` subclass's `run()`; any other `run()` call on a `Thread` is `start()`.                                                                                             |
| `AvoidFileStream`                  | A stream, reader or writer over a `FileDescriptor` (`new FileInputStream(FileDescriptor.in)`), which `Files` has no form for.                                                                      |
| `AvoidArrayLoops`                  | A copy loop that subtracts the loop variable in an index (a reversed copy), which `System.arraycopy` cannot do.                                                                                    |
| `UseArraysAsList`                  | A loop that filters, steps by more than one or does more than add each element; the loop that only adds is `Collections.addAll(target, array)`.                                                    |
| `SimplifiedTernary`                | A ternary whose other branch is not a boolean (`Object o = c ? true : name`), which has no `\|\|` or `&&` form.                                                                                    |
| `LogicInversion`                   | `!(a < b)` on a `float` or `double`, which differs from `a >= b` when a value is NaN; `!(a == b)` is `a != b` for every type.                                                                      |
| `ConfusingTernary`                 | Reported only for a negated condition (`if (!c) A else B` is `if (c) B else A`); `if (a != b)` with an else and else-if chains pass.                                                               |
| `NegatedOperands` (new)            | An `&&` or `\|\|` chain with at least one operand that is not negated (`!a && b`); `!a && !b` is `!(a \|\| b)`.                                                                                    |
