# Guards

Part of the [Java preset guide](../java-preset.md).

Rules for patterns that coding agents often write. Each one stays on; when one flags code that is
right, add an exception for its rule to `nitpicker.config.json` (`rule`, `paths`, `reason`). Every
PMD message ends with that route, and the guard messages from javac, forbiddenapis, Checkstyle and
the dependency and cycle checks end with it too. Inline suppressions are not a route:
`@SuppressWarnings("unchecked")` and the like are blanked before `javac` lints, so they hide
nothing. The rules read base and head the same way, so only a pattern a change adds fails.

| Guard                                                                                                                                            | Rule as printed                                                                                                                                                                 | Allowed form                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Package cycles                                                                                                                                   | `coupling/package-cycle`                                                                                                                                                        | Move shared types down, or invert one dependency behind an interface                                                         |
| `Optional.get()`; `Optional` as field, parameter or record component; `Optional<List<..>>`                                                       | `pmd/OptionalGet`, `pmd/OptionalAsFieldOrParameter`, `pmd/OptionalOfCollection`                                                                                                 | `orElseThrow()`, `orElse`, `map`, `ifPresent`; return an empty collection                                                    |
| Raw types, unchecked casts, deprecated and removed APIs, redundant casts                                                                         | `javac/rawtypes`, `javac/unchecked`, `javac/deprecation`, `javac/removal`, `javac/cast`                                                                                         | Type arguments, typed APIs, the replacement the Javadoc names                                                                |
| `instanceof` followed by a cast                                                                                                                  | `pmd/InstanceofThenCast`                                                                                                                                                        | Pattern matching (`x instanceof Circle c`) or a `switch` over a sealed type                                                  |
| Non-private fields, mutable static state, `@SneakyThrows`                                                                                        | `checkstyle/VisibilityModifier`, `errorprone/NonFinalStaticField`, `pmd/MutableStaticCollection`, `pmd/SneakyThrows`                                                            | Private fields, a `record`, immutable `List.of` and `Map.of`, a declared exception                                           |
| Legacy date and time, `now()` without a `Clock`, `Thread.sleep`, `Thread.start()`, `Runtime.exec(String)`, `ObjectInputStream`                   | `forbiddenapis/legacy-date-time`, `clock-now`, `thread-sleep`, `new-thread`, `runtime-exec`, `java-deserialization`                                                             | `java.time`, an injected `Clock`, an executor, `ProcessBuilder` with a list, JSON                                            |
| Swallowed `InterruptedException`; side effects in `forEach` and `peek`; `collect(Collectors.toList())`; an unclosed `Files.lines/list/walk/find` | `pmd/SwallowedInterruptedException`, `pmd/ForEachSideEffect`, `pmd/CollectorsToList`, `pmd/StreamResourceNotClosed`                                                             | `Thread.currentThread().interrupt()`, `map` and `collect`, `Stream.toList()`, try-with-resources                             |
| `throws Exception`, raw `RuntimeException`                                                                                                       | `pmd/SignatureDeclareThrowsException`, `pmd/AvoidThrowingRawExceptionTypes`                                                                                                     | The checked exceptions the method throws; `IllegalArgumentException`, `IllegalStateException`, a project exception           |
| SQL built with `+` or `String.format` in JDBC calls; MD5 and SHA-1; nested-quantifier regexes; a path joined from a parameter                    | `pmd/SqlConcatenation`, `pmd/WeakHash`, `pmd/NestedQuantifierRegex`, `pmd/PathFromParameter`                                                                                    | `?` parameters, SHA-256, a regex without `(a+)+`, `normalize()` and `startsWith(base)`                                       |
| Constant names; magic numbers                                                                                                                    | `checkstyle/ConstantName`, `checkstyle/MagicNumber`                                                                                                                             | `UPPER_SNAKE_CASE` (a logger may be `log` or `logger`); a named `private static final`                                       |
| Duplicates with renamed names, and in test sources                                                                                               | `duplicates/duplicate-clone`                                                                                                                                                    | One shared method; a helper or `@ParameterizedTest` in tests                                                                 |
| Declared but unused dependencies                                                                                                                 | `dependencies/unused-declared-dependency`                                                                                                                                       | Remove it, or declare it `testImplementation`, `runtimeOnly` or `compileOnly` (Maven: `test`, `runtime` or `provided` scope) |
| Test honesty                                                                                                                                     | `pmd/FixedSleepInTest`, `DisabledTest`, `AssertionInControlFlow`, `TryCatchInTest`, `TautologicalAssertion`, `AlwaysFailingAssertion`, `MockedValueType`, `TestOrderDependence` | See Tests below                                                                                                              |

A Checkstyle rule prints as its check name, for example `checkstyle/MagicNumber`; see
[Rule messages](#rule-messages).

- **PMD categories.** `performance`, `multithreading` and `security` run next to `errorprone`
  and `bestpractices`, on main and test sources. Their fixes are in the PMD rule catalog
  (`languages/java/messages/pmd.json`, for example `StringToString`: "Remove the toString()
  call."), appended with the exception route like every catalog rule. Six rules
  are left out because they flag correct code by design, with no general recommendation behind
  them: `AvoidInstantiatingObjectsInLoops` (building result objects in a loop is the normal way
  to fill a list), `UseConcurrentHashMap` (it flags every `HashMap`, and a local map is correct),
  `InsufficientStringBufferDeclaration` (an initial capacity is an optimisation, not a defect),
  `AvoidUsingVolatile` (`volatile` is the correct tool for a flag read by other threads),
  `DoNotUseThreads` (it flags `ExecutorService`, the allowed form; `new Thread` is a
  forbiddenapis finding) and `TooFewBranchesForSwitch` (a pattern `switch` over a sealed type with
  two cases is the preferred form). `AvoidSynchronizedAtMethodLevel` stays, with a message that
  points at a lock, since its stock advice (a `synchronized` block) is what
  `AvoidSynchronizedStatement` forbids.
- **Where they run.** `languages/java/gradle/pmd-ruleset.xml` holds the rules for main and test
  sources. `rules/guards-ruleset.xml` runs on main sources only (nitpicker writes a wrapper
  ruleset that excludes the test directories, with the same code on Gradle and Maven: the init
  script hands the source directories and the compiler settings to
  `languages/java/builds/rulesets/write-rules.mjs`), `rules/test-honesty-ruleset.xml` on test
  sources only (its wrapper excludes every file, then includes the test directories back, since
  PMD lets an include pattern override an exclude pattern). A project's own `config/pmd/ruleset.xml`
  replaces all of them unless it opts in as before. `InstanceofThenCast` and `CollectorsToList` are
  left out when the main compile targets a release below 16 (`options.release`, else the last
  `--release` of the compiler arguments, else their last `-target`, else `targetCompatibility`,
  on both builds), since pattern matching and `Stream.toList()` need 16. Maven modules also get
  `pmd-tests.xml` (`TestClassWithoutTestCases` on test sources) and the Checkstyle name formats
  below, as Gradle projects do.
- **Narrowed rules.** `OptionalAsFieldOrParameter` skips parameters bound by Spring web
  annotations (`@RequestParam`, `@RequestHeader`, `@PathVariable`, `@CookieValue`,
  `@RequestAttribute`, `@SessionAttribute`, `@MatrixVariable`, `@RequestPart`), where an optional
  request value is the framework's form, and overriding methods, whose signature is fixed.
  `OptionalOfCollection` leaves fields, parameters and record components to
  `OptionalAsFieldOrParameter`. `StreamResourceNotClosed` skips a stream, or a chain of calls that
  ends in a stream, that is returned or is the body of a lambda (a `flatMap` closes what it
  flattens), and a stream held in a variable that a `try (lines)` or a `close()` closes.
  `ForEachSideEffect` reports `forEach`, `forEachOrdered` and `peek` on a stream only, not
  `Iterable.forEach` or `Map.forEach`. `SwallowedInterruptedException` accepts
  `Thread.currentThread().interrupt()` or a `throw`, not an `interrupt()` on another thread.
  `InstanceofThenCast` reports a cast only inside the branch the test guards (the `if` body, the
  right side of `&&`, the true side of `?:`) and not after a negated test; it skips a cast that adds
  type arguments the `instanceof` cannot test (`o instanceof List`, then `(List<String>) o`). `CollectorsToList` reports `collect(Collectors.toList())` only, not a downstream
  `toList()` inside `groupingBy` or `mapping`. `NestedQuantifierRegex` reports a repeated group
  that holds a repeated item followed only by optional ones (`(a+)+`, `(\w+\s?)+`, `(\w+\s*)+`)
  and a group of an item and its repetition (`(a|aa)+`), not a group with a required item after
  the repeated one, such as `([A-Z][a-z]+)+` or `(\s*,\s*)*`. `PathFromParameter` reports
  non-private methods and constructors only, so a private helper called with fixed names is fine,
  and names a parameter used on its own or in a `+` expression (`resolve(name + ".txt")`); only a
  `normalize()`, a real-path call or a `startsWith` on a `Path` counts as the check, not
  `name.startsWith("x")`.
  `SignatureDeclareThrowsException` skips overriding
  methods, a method that takes Spring Security's `HttpSecurity`, `WebSecurity`,
  `AuthenticationConfiguration` or `AuthenticationManagerBuilder` (whose methods declare
  `Exception`), `getObject()` of a `FactoryBean`, `main(String[])` and the methods of a
  `@FunctionalInterface` (a `Callable`-like type whose lambdas may throw anything).
  `MutableStaticCollection` skips a private static concurrent collection used as a cache, a blocking queue included.
- **Checkstyle.** `rules/checkstyle-all.xml` (`ConstantName`) is added to the `google_checks.xml`
  rules for main and test sources; `rules/checkstyle-main.xml` (`MagicNumber` with `-1`, `0`, `1`
  and `2` allowed and `hashCode` and annotations ignored, `VisibilityModifier` with public final
  fields allowed) for main sources only. `ConstantName` checks constants of primitive, `String`,
  boxed, `BigDecimal`, `BigInteger` and `Duration` type; a `static final` reference to an object
  such as `mapper` keeps its camel-case name. `VisibilityModifier` allows protected fields of a
  `@MappedSuperclass`, and fields without an access modifier in a class annotated with Lombok's
  `@Value` or `@FieldDefaults(level = AccessLevel.PRIVATE)`, which Lombok makes private. These
  scopes are `SuppressionXpathSingleFilter` modules inside the
  generated config, not inline suppressions. The messages are rewritten to name the allowed form.
- **javac lint.** The `nitpickerLint` task writes `guards-plan.json` (the main sources, the
  compile class path, the processor path, the compiler, its release, source, target, encoding and
  arguments, the classes directory and the generated-sources directory) and runs node on it
  (`-Pnitpicker.node`, the head run also passing the base project as `-Pnitpicker.lintBaseline`),
  so the lint of several projects runs in parallel when Gradle does; it compiles the main sources
  once more with
  `-Xlint:rawtypes,unchecked,deprecation,removal,cast` and writes the warnings to
  `javac-lint.txt` in the report directory (tool `javac`, rule = lint category). The same runner
  serves Maven. It compiles a copy in which every `@SuppressWarnings(...)` is blanked out (same
  lines and columns), with the project's compiler, release (or `-source`/`-target` from the source
  and target compatibility when no release is set) and compiler arguments (without `-Werror`,
  `-nowarn`, `-Xlint`, `-Xdiags`, `-XD`, `-Xplugin`, processor options and class or module paths),
  and with the main classes on the classpath, so it runs only Lombok of the annotation processors
  (the classes other processors generate are already compiled) and stops after flow analysis
  without writing classes. When javac counts warnings but prints none in the form nitpicker reads,
  the lint counts as not run. The copy
  keeps the sources' paths below the analysis root, with every `lombok.config` on the way from the
  root down to each source folder, so Lombok reads the project's configuration (a package folder's
  `fluent` accessors or log field name included), and those of the folders above the root up to one
  that sets `config.stopBubbling`; a relative `import` in a copied file is pointed at the file it
  names. A warning javac places on a Lombok annotation (`@SuperBuilder` or `@Builder` code that
  Lombok generates) is dropped: it is not in code the project wrote. With a `module-info.java` the
  sources compile as that module, with the modular jars of the class path on `--module-path` (and,
  if that fails, every jar), the sources other annotation processors generated (MapStruct,
  Immutables, Dagger) compiled along without their warnings being reported, and every file is
  linted. On the head, when the base produced a lint report in the same run (kept with a fingerprint
  of its compile inputs in `<build dir>/nitpicker-lint/` of the base checkout, Maven's
  `target/nitpicker-lint/`), the base's warnings are reused for files whose content is the same as
  on the base, so the report matches a full lint. They are reused only when the compile inputs match
  the base's: the javac version, the language level, the encoding, the compiler arguments (the
  checkout's folder left out), every `lombok.config` that applies to the sources and every class
  path and Lombok entry (a jar outside the project by name and size; a jar inside it, or a classes
  directory such as another project's, by its content), so a dependency bump that deprecates an API
  or a changed Lombok setting is reported in unchanged files too. An unchanged file whose classes
  use a class of a changed file, directly or through a subclass (read from the head's class files),
  is compiled again, so a method the change deprecated or a class the change made generic is
  reported where it is called. A constant javac inlined leaves no trace in the class files, so
  deprecating a `static final` constant is reported only in changed files. Without a base report or
  with other compile inputs the head lints every file. When the lint compile fails the run goes on:
  the report says so in a descriptive `javac/lint-not-run` notice that quotes the first error, and
  javac warnings are not checked in that run. When only the base failed, the head's javac findings
  under that module's main source roots are reported but do not fail the gate: with no base report,
  nothing tells which of them the change added, and each one says so. When only the head failed, the
  run fails with a tool error: the change broke the lint compile. The notice says to fix what the
  lint compile reports, and ends with the exception route for `javac/lint-not-run` with the path
  `**`, for a project that cannot be linted this way.
- **Run time.** Each snapshot runs in a fresh worktree with a fresh report directory, so Gradle's
  up-to-date checks do not skip these tasks; what saves time is the differential lint. Measured on
  a project with 31 main files using Lombok and MapStruct (load about 40), the lint took 22.0 s for
  every file and 13.1 s with a one-file change; on a smaller project, 6.2 s and 3.9 s. Most of what
  is left is starting javac with the processor and class path.
- **forbiddenapis.** [forbiddenapis](https://github.com/policeman-tools/forbidden-apis) 3.10
  (Apache-2.0, one jar from Maven Central, pinned in the init script) reads the main bytecode
  against `rules/forbidden-apis.txt`. Each signature group has a tag that becomes the rule name
  (`thread-sleep`); the report is `forbidden-apis.txt`. Source locations come
  from the class's debug line numbers; a field, parameter, return type, record component or
  supertype of a banned type is placed on its declaration in the source (comments and strings
  do not count); one forbiddenapis cannot tie to a line goes on its class's line, and generated
  members (lambdas, record accessors, Lombok accessors and builders of a reported field) are
  dropped. forbiddenapis reads type descriptors, so a generic argument such as `List<Date>` or
  `Map<String, Date>` is not reported. `new-thread` bans `Thread.start()`,
  `Thread.startVirtualThread` and `Thread.Builder.start`, so a `ThreadFactory` or
  `Runtime.addShutdownHook` may still construct a `Thread`. `legacy-date-time` skips a `Date`
  another API returns when `.toInstant()` follows the call right away, on that line or at the start
  of the next (`certificate.getNotAfter().toInstant()`), or it is converted with
  `map(Date::toInstant)`; any other call on a `Date` in the same line, such as `getTime()`, is
  still reported.
- **Duplicates.** The jscpd check is unchanged. `nitpickerCpd` runs PMD's copy-paste detector
  (BSD-style, already inside the pinned PMD) over main and test sources with identifiers and
  literals ignored and at least 100 tokens, so a copy with renamed variables is found. When jscpd
  (its plain run or its renamed-copies run) and CPD report the same clone (same two files, overlapping lines, jscpd's range ending at its
  start line plus `lines` minus one), only the CPD finding is kept, also when nitpicker then drops
  CPD's clone as boilerplate or as overlapping its own copy; in a module where CPD did not run or
  wrote no usable report, jscpd's clones stay, overlapping
  windows of one file pair are one finding, a block that overlaps its own copy is dropped, and so
  are clones made only of getters, setters, field declarations and field-assigning constructors
  or only of data rows (enum constants, `Arguments.of(...)` rows, literal lists, and constants
  built from literals with `Map.ofEntries`, `Map.of`, `List.of`, `Set.of`, `Stream.of` or
  `Arrays.asList`; any other row needs a number or a literal, so a run of calls such as
  `validate();` is code). The files of a duplication are sorted by path, so the order CPD lists them in
  does not matter, and the identity hashes the clone's token shape (its punctuation and
  operators, without names, literals and comments), so editing a name or a literal in a legacy
  copy keeps its identity. A legacy clone that shrinks (a statement inserted in one copy) or
  that jscpd splits in two is held at its base size, for jscpd and CPD alike, while most of each
  of its two copies is unchanged code that was part of that base clone: a new clone between the
  same two files fails when either copy is mostly added or edited lines, or lines that were not
  in a base clone of the pair (a pasted copy, or code joined by deleting what was between), or
  when it, with the other new clones of that pair, has more tokens than the base clone it came
  from.
  Both tools hold against the same pair (`pair:<a>|<b>:clone`, counted in tokens), so a legacy CPD
  clone that shrinks below CPD's 100 tokens and is then reported by jscpd is held too. Findings use
  the same tool and rule as jscpd (`duplicates/duplicate-clone`), with identities starting `cpd:` so
  they never match a jscpd finding; renaming one of the two files keeps a clone's identity even when
  the new name sorts the files the other way round; between two test files the message points at a helper or a
  `@ParameterizedTest`. The message ends with the exception route for
  `duplicates/duplicate-clone`. Both builds run CPD through `languages/java/gradle/CpdReport.java`
  (single-file source mode, with the pinned PMD on the class path) instead of `PmdCli cpd`, with
  the same settings and the same XML report, which it writes to the path given as its first
  argument. PMD 7.7.0 to 7.28.0 crash on common code with `Deque.peek().name is null`, and
  `PmdCli` still exits 0 without a report: the Java CPD lexer's constructor detector pushes a type
  on every `class` keyword, a class literal (`String.class`) followed by `}` leaves that type
  without a name, the next declaration without a modifier (a bare `class`, or any `enum`) keeps it
  on the stack, and the next `(` reads its null name. One file is enough
  (`static final Class<?>[] TYPES = { String.class }; enum Kind { X } void register() { }`), and
  the state also carries from one file to the next. The launcher reads each file as CPD would (CRLF and CR line ends become LF,
  a byte order mark is dropped), runs PMD's own Java token manager over that text first and
  overwrites every `class` token that directly follows a `.` token with `const`, at the token's
  place: comments between the two are skipped like PMD skips them, text inside comments, strings,
  text blocks and character literals is never a token, and a Unicode-escaped dot or `class` is
  translated as PMD translates it, so `// values.` followed by a `class` line keeps its `class`.
  `const` is a Java keyword no code uses, so it stays a keyword token like `class` and has the
  same length (an escaped `class` is padded with spaces), and the tokens, lines, columns and paths
  of the report do not move (an identifier such as `c$ass` would be ignored like any identifier
  and match `other.value`). On the PMD 7.7.0 sources of pmd-java and pmd-core the report equals
  `PmdCli`'s apart from the timestamp and the `codefragment` text, which shows the rewrite;
  nitpicker reads clone text from the source files instead. The launcher follows symbolic links
  and reads a file that two source roots reach once; a link loop, an unreadable file or directory,
  a missing directory argument, or a file whose rewrite throws is skipped with a line on stderr and
  listed in `cpd-skipped.txt`. A file PMD cannot lex (a stray `#`, or syntax PMD 7.7 does not know)
  is handed to CPD with the class literals before the error rewritten; CPD skips it and records an
  `<error>` in `cpd.xml`. The module then gets one descriptive `duplicates/cpd-skipped-paths`
  notice naming each of those paths once. Both builds take the launcher, its
  arguments (the report path, then the source roots) and what counts as a run from the `cpd`
  entry of `languages/java/builds/tools/tool-commands.json`: exit code 0 and a `cpd.xml` whose
  root is `<pmd-cpd>`. When CPD exits with another code or writes no XML report, both builds write its exit code (or signal) and stderr to
  `cpd-failed.txt` instead of `cpd.xml`; on Maven a `java` that cannot start or runs past the
  15-minute tool timeout writes the error code (such as `EACCES` or `ETIMEDOUT`) and message there
  instead of failing the run. The module then gets a `duplicates/cpd-not-run` tool-not-run finding
  that names its source roots and says how CPD ended: it exited with a code, was stopped by a
  signal, could not run, or did not finish within the tool timeout (an empty or non-XML `cpd.xml`
  gives the same finding). Its `notRunScope` lists the module's main and test source roots as
  project-relative directories. Maven writes each module's roots relative to the module, so the
  module folder goes in front of each root first; then a root that is the project folder itself
  becomes `.`, and a root that lies outside the project after that (absolute, or above the project
  folder) is left out. A module without source roots is scoped to its folder. When no directory in
  the project is left, the notice keeps its message but is not a tool-not-run finding: the code it
  did not check lies outside the project, and the guards drop every finding on a file outside the
  project (a finding's path must lie in the project, and one that does not would make the whole
  Java report fail to parse), so nothing in the comparison is left to relax. A failure on the base
  makes the head's CPD findings (identity `cpd:...`, from `notRunIdentityPrefix`) in those
  directories descriptive, and those on the exact head paths of the files renamed out of them, as
  long as they match no base finding; jscpd's clones there stay enforced, since jscpd ran. The directories themselves never follow a move: a
  module moved whole into an existing one relaxes only the moved files, and a module renamed whole
  that still fails gives a conservative tool error on the head, while the CPD findings of its
  renamed files stay descriptive. A legacy finding that matches a base finding stays unchanged and
  enforceable, so a failed run never shows it as resolved plus new. A failure on the head is a tool
  error unless a base notice of the tool with the same prefix has the same identity and path or
  those base notices together cover each of its directories. One file moved into a module
  that ran on the base therefore does not excuse that module failing on the head. The
  `javac/lint-not-run` notice is scoped the same way, to the module's main source roots.
- **Cycles.** `java-coupling.mjs` already has the class graph from jdeps. Each package in a
  strongly connected set of packages is one `package-cycle` finding, identified by the package
  name and placed on its first file, so growing a legacy cycle adds a finding for the new package
  only and shrinking it resolves findings without re-reporting the rest. The edge from a sealed
  type to the subtypes it `permits` is left out (`permits.txt` in the report directory, read by
  nitpicker from the `PermittedSubclasses` attribute of the main classes; a class file it cannot
  read is skipped), since a sealed hierarchy across packages is
  the intended form. Cycles between classes of one package are not reported: two-way references
  such as a parent and its children or JPA associations are normal.
- **Dependencies.** `nitpickerDependencies` writes `dependencies.json`: each
  `implementation` and `api` dependency with the names of its own artifacts (not those it brings
  in transitively) and whether a main class references a class in them. The references are read
  from the class files' constant pools, which include annotation and generic signature types, so
  a library used only for its annotations counts as used. A dependency with artifacts and no
  reference is `unused-declared-dependency`; starters, BOMs and platforms are never reported, and
  `runtimeOnly`, `compileOnly` and test configurations are not checked. The finding sits on the
  build file. On a Maven build see [Maven builds](#maven-builds) for which dependencies count.
  Versions are not checked: how a project pins its versions is its own choice.
- **Tests.** The test rules run on test sources only. `DisabledTest` (`@Disabled`, `@Ignore`), `AssertionInControlFlow` (an
  assertion or `verify` inside an `if`, `switch`, loop or `?:` of a test method; an `if` that only
  calls `fail` is fine),
  `TryCatchInTest` (use `assertThrows`; a `try` inside a lambda or an anonymous class is fine),
  `TautologicalAssertion` (`assertThat(true)`, `assertTrue(true)`,
  `assertEquals(1, 1)`; `assertEquals(a, a)` is a reflexivity test and is fine),
  `AlwaysFailingAssertion` (`assertTrue(false)`, `assertFalse(true)`: use `fail`), `MockedValueType` (a `String`, number,
  date, `Optional`, record or concrete collection such as `ArrayList` mocked or spied with `mock`, `spy` or `@Mock`; an
  interface such as `List` or `Map` may be mocked) and `TestOrderDependence` (`@TestMethodOrder` other than
  `MethodOrderer.Random`, `@FixMethodOrder`, `@Order` on a test). A test class with `static`
  non-final fields or a static
  collection it changes is an `errorprone/NonFinalStaticField` or `pmd/MutableStaticCollection` finding
  like production code. A test with no assertion at all is still
  `pmd/UnitTestShouldIncludeAssert`. Assumptions (`assumeTrue`) and tests that only `verify` a
  call are not reported: environment guards and verifying a `void` collaborator are legitimate.
- **Fixture.** `languages/java/guards/guards.e2e.test.mjs` runs the Gradle tasks on
  `languages/java/adapters/fixtures/guards-project`, whose sources hold one violating and one clean
  sample per rule with a `// violation: <tool>/<rule>` marker, and expects exactly the marked
  findings (part of `npm run test:java`). The clean samples include a `@RequestParam Optional`
  parameter, an `HttpSecurity` bean method that throws `Exception`, a main-code rule in a test and
  a test rule's pattern in main code, the Spring Security methods that throw `Exception`, a generic
  cast after `instanceof`, a `try (lines)` on a variable, a `fail` guard and `assertEquals(a, a)`.
  The test also checks one message's exception route, and runs `guards-compile-modes`: PMD on its
  `legacy` module, compiled for Java 11 through `options.release`, and its `arguments` module,
  compiled for Java 11 through `--release` in the compiler arguments, where `InstanceofThenCast`
  and `CollectorsToList` must not fire, and the lint on modules with a javac plug-in (`-Xplugin`),
  `--enable-preview`, a module descriptor with a sealed type across packages, a source root
  outside the project and Lombok with a package folder's `lombok.config` and a `@SuperBuilder`
  warning; `maven-preset.e2e.test.mjs` lints the same modules with Maven, Lombok included. The
  `lint-not-run` path is unit-tested only: a source that breaks the lint compile breaks
  `compileJava` first.
- **Left out on purpose.** Lombok `@Data` (a record is the allowed form for data, but `@Data` on a
  JPA entity is common enough that blocking it needs its own decision), `java.util.Random`
  (`SecureRandom` is right for tokens, but a plain `Random` for sampling is legitimate and the
  tool cannot tell), and a path join that is checked after the fact in another method.
