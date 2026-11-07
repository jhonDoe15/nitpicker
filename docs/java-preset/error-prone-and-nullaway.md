# Error Prone and NullAway

Part of the [Java preset guide](../java-preset.md).

- **What runs.** `nitpickerErrorProne`, a dependency of `nitpickerJava`, compiles the main Java
  sources and those of every test source set (`test`, `integrationTest`, `testFixtures`, the same
  ones Maven compiles as test sources with build-helper's `add-test-source`) a second time with javac and Error Prone 2.50.0 (Apache 2.0) as its
  plugin, plus NullAway 0.14.2 (Uber, MIT), an Error Prone plugin for null safety. The task lives
  in `languages/java/gradle/errorprone/` (`error-prone.gradle`, applied by the init script to
  every `java` project, and `ErrorProneReport.java`). It uses the classpath, annotation processors,
  compiler arguments and encoding of `compileJava` and of each test source set's compile task, writes classes only to
  the throwaway `build/nitpicker/errorprone/`, and leaves the regular compile and the consumer
  build alone. javac runs in its own JVM through `ErrorProneReport.java` in single-file source
  mode, which writes every diagnostic to `build/nitpicker/errorprone.json`. Error Prone and
  NullAway resolve from a detached configuration with their versions pinned in the init script's
  map, so a dependency-management plugin of the project cannot move them. A compile error in this
  second compile fails the task with javac's errors (a `tool-error` on the CLI path); it never
  becomes an empty report. `module-info.java` is left out, so the sources compile in the unnamed
  module. Kotlin preset: Java sources only, like PMD and SpotBugs.
- **Which JDK.** Error Prone needs JDK 21 or newer. On Gradle the runner uses the JVM that runs
  Gradle when it is at least 21 and at least the JDK of every compile task's toolchain; otherwise
  it asks Gradle's toolchain service for a launcher of the version it needs (found locally or
  downloaded, like the project's own toolchains), and when there is none it fails with a message
  that says which JDK to install or how to let Gradle download it. With `--enable-preview` it runs
  on exactly the project's JDK, since only that JDK compiles its preview features. On Maven the
  runner uses the JDK Maven runs on (`JAVA_HOME`, else `java` on the PATH) when it is 21 or newer
  (with `--enable-preview`, always that JDK); otherwise it takes the installed JDK closest to 21
  from the `JAVA_HOME_<N>_X64`/`_ARM64` variables of hosted CI, the `jdkHome` entries of
  `~/.m2/toolchains.xml`, SDKMAN, `/usr/lib/jvm` and `/Library/Java/JavaVirtualMachines`, so a
  project on JDK 17 keeps working wherever a JDK 21 is installed. With none it fails before
  anything compiles, naming the JDK it needs and where it looked; a missing `java` is reported as
  `java not found`.
- **Language level and options.** The runner mirrors the project's own form: `--release <n>` when
  the build uses `release`, `-source <n> -target <n>` when it uses source and target compatibility
  (a project on `-source 8` stays on 8). A `--release` next to an `--add-exports` of a JDK module
  (`java.*`, `jdk.*`) becomes `-source`/`-target`, which javac requires. Of the build's compiler
  arguments it keeps `--enable-preview`, the `-A` processor options and the module options javac
  takes (`--add-exports`, `--add-modules`, `--add-reads`); `--add-opens`, a runtime option, is
  dropped and so never changes the level. Argument files are
  written as UTF-8.
- **Maven.** Maven builds run the same `ErrorProneReport.java` from `languages/java/maven/errorprone/`
  after `mvn test`. The compiler settings come from the effective POM (`help:effective-pom`), so
  parents, `pluginManagement`, imported BOMs (Spring Boot's parent among them) and `${...}`
  properties are already resolved; the `default-compile` execution's configuration wins over the
  plugin's, and the test pass reads `default-testCompile` and `testRelease`, `testSource` and
  `testTarget` the same way. `compilerArgs`, `compilerArgument` (split at spaces) and
  `enablePreview` give the compiler arguments; an empty element such as `<release/>` counts as
  missing. With no level at all, `maven-compiler-plugin` 3.x compiles for its own default (1.5 to
  1.8, by version), which the runner gives javac as `-source 8 -target 8`, the oldest level JDK
  21's javac takes; plugin 4.x has no such default and javac's own applies. An `annotationProcessorPaths` entry without a version takes it from the effective
  `dependencyManagement`, as `maven-compiler-plugin` does; one with no version there, or an
  unresolved one, is a tool error that names the coordinate, never a guessed version. Without
  `annotationProcessorPaths` the processors come from the classpath, as javac finds them. The main
  classpath ends with `target/classes`, so classes that code generators (protobuf, JAXB, OpenAPI,
  jOOQ, ANTLR) compiled there resolve; the module's own sources are compiled from source and take
  precedence over those classes. The runner turns `checks.json` into Error Prone flags, finds the
  project's packages from its classes, and decides the language level and kept options, so the two
  builds cannot drift apart; the Maven e2e test checks that both give the same findings.
- **Findings.** `languages/java/ingest/errorprone/errorprone.mjs`, through
  `languages/java/adapters/errorprone/java-errorprone.mjs`: tool `errorprone`, rule the check
  name (`errorprone/FutureReturnValueIgnored`, `errorprone/NullAway`), every finding enforceable.
  The message is the diagnostic's first line plus Error Prone's `Did you mean ...` fix when it has
  one, rewritten by `ingest/errorprone/messages.mjs`: NullAway gets the allowed form (annotate with
  the `@Nullable` the project already uses, JSpecify's only when it uses none, and check before
  use, or give a non-null value), so no skill line is needed for it; `CheckReturnValue` says to use
  the result or make the method return void, without Error Prone's `@CanIgnoreReturnValue`,
  `verify(...)` and `var unused` alternatives; `JavaTimeDefaultTimeZone` says to inject a `Clock`
  or `ZoneId`; `DefaultCharset` says the result depends on the runtime and the JDK version (JDK 18
  made UTF-8 the default) and asks for the charset explicitly; a suggestion of punctuation alone
  (`'{'`, `'*'`) is dropped; and where the source set's compile classpath has no Guava
  (`guava`/`testGuava` in `manifest.json`), Guava suggestions are given in their JDK form
  (`IllegalStateException` for `VerifyException`, `List.of` for `ImmutableList.of`) or dropped,
  with the summary's Guava advice too. In the java preset, a finding of a
  check that can flag correct code ends with the exceptions route, in the same words as the other
  tools (`If this is intended, add {"rule":"errorprone/<Check>",...} to "exceptions" ...`, with the
  file as the path). Only findings in main sources of the checks in `certainBugs` in `checks.json` go without it: a
  curated list of ERROR checks whose finding in main code is a bug, not a severity filter (the
  ERROR checks left out, and why, are listed below). Findings in test sources always keep the
  route, since a test can build the broken case on purpose. The route is added after the identity is computed, so it
  does not change it. Diagnostics outside the main and test source roots (annotation-processor
  output) are dropped. Diagnostics with the same check, file, line, column and message are one
  finding, and the `class is an internal JDK API` diagnostic `SunApi` adds at the `.class` of a
  literal it already reported is dropped; different columns or messages on a line stay apart. Identity: a hash of the check and the
  message's first line, with
  `line <n>` removed, and `#2`, `#3` for repeats in one file in source order; no line, no path and
  no `Did you mean` text, so moved or reformatted code stays baselined and a renamed file follows
  the rename map.
- **Policy: every check that catches a bug class or names one allowed form.** All 641 checks of
  2.50.0 were reviewed, including the off-by-default, experimental and suggestion-level ones
  (`reviewedChecks` in `checks.json`, with the reviewed Error Prone and NullAway versions under
  `reviewed`; a unit test fails when the init script or the Maven path pins other versions, and
  the e2e test fails when the jar's checks differ from the reviewed ones). On: every ERROR and
  WARNING check Error Prone enables by default except 10, plus 109 of its off-by-default checks (for
  example `FieldCanBeLocal`, `FieldCanBeFinal`, `IdentifierName`,
  `PrivateConstructorForUtilityClass`, `RedundantThrows`, `CheckedExceptionNotThrown`,
  `ThrowSpecificExceptions`, `NonFinalStaticField`, `BanSerializableRead`,
  `UseCorrectAssertInTests`): 595 checks. A check is off only when another check that is always on
  reports every case it does at the same place, it fights another tool, needs an annotation library a project would add only for it (Error Prone's own
  annotations, Guava, auto-common), flags legitimate code with no allowed form, or picks one of two
  forms that are both valid conventions (`var` or the explicit type, `final` on parameters and
  locals or not, `getClass()` or `instanceof` in `equals`, an if-chain or a `switch`): those are
  never flagged. One-way rules stay on, such as `StatementSwitchToExpressionSwitch`,
  `UnnecessarilyFullyQualified`, `NegativeBoolean`, `UnnecessaryTestMethodPrefix` and
  `UnnecessaryStaticImport`. Checks for libraries a project does not use (Guice, Dagger,
  AutoValue, Flogger, Truth, protobuf, Android) stay on: they cost nothing and fire only where the
  library is used. Error Prone's severities do not matter: everything is reported as a warning
  (`-XepAllErrorsAsWarnings`) and every finding is enforceable. The checks that are off are below.
- **Results of the project's own methods.** `CheckReturnValue` runs with `Packages` set to the
  project's top-level packages (the shortest packages holding its main or test classes; Error
  Prone matches subpackages too), so ignoring the result of any of the project's own methods
  fails, in main and test code, test-only packages included. The message asks to use the result
  or make the method return void; a value dropped on purpose can still be assigned to
  `var unused = ...` (PMD's unused-variable rules skip names starting with `unused`).
- **NullAway.** Main sources only: a test that passes `null` on purpose to check the failure is
  legitimate. `AnnotatedPackages` is the project's main packages: its code is non-null unless
  marked, and a field, parameter or return value that may be null carries a `@Nullable` (NullAway
  accepts any annotation of that simple name, so whichever one the project uses is right and never
  flagged; JSpecify's `org.jspecify.annotations.Nullable` is the one to add when it has none, and
  Spring Framework 7 already depends on it). Libraries without nullness annotations are trusted.
  Fields a framework sets are not reported as uninitialized (the `nullAway` options in
  `checks.json`): `@Autowired`, `@Value`, `@Inject` (javax, jakarta, Guice), `@PersistenceContext`,
  Mockito's `@Mock`, `@InjectMocks`, `@Spy` and `@Captor`, Spring Boot's `@MockBean`, `@SpyBean`,
  `@MockitoBean` and `@MockitoSpyBean`, the fields of a JPA `@Entity`, `@Embeddable` or
  `@MappedSuperclass` class (NullAway's `ExternalInitAnnotations`: its methods are still checked),
  and fields a `@PostConstruct` method sets. A plain bean whose field
  only a setter assigns keeps the finding. Without main classes in a named package,
  `CheckReturnValue` keeps its defaults and NullAway is off.
- **Annotated classes.** The runner records, for every diagnostic, the annotations of every
  class around it (so a nested or anonymous class of an exempt class is exempt too),
  meta-annotations included (`classAnnotations` in `errorprone.json`,
  so `@SpringBootApplication` also lists `@SpringBootConfiguration` and `@Configuration`).
  `classExemptions` in `checks.json` names the checks a class annotation rules out, and those
  diagnostics are dropped; the table below gives the reason for each. `IdentifierName` also spares
  a class named the way Maven's Failsafe plugin finds integration tests (`AdderIT`, `ITAdder`,
  `AdderITCase`; `exemptions/test-class-names.mjs`).
- **No inline escape.** Error Prone honors `@SuppressWarnings`, because Lombok marks the members
  it generates with `@SuppressWarnings("all")` and Error Prone must skip them. The inline
  suppression scan reads the source the project wrote, where Lombok's annotations are not, and
  reports as `errorprone/InlineSuppression`: every `@SuppressWarnings` value that would silence a
  check nitpicker runs (its name or an alternative name such as `"dep-ann"`, the `suppressible`
  list in `checks.json`) or NullAway (`"NullAway"`, `"NullAway.Init"`); `@NullUnmarked`, which
  turns NullAway off for the code under it; and a `@CanIgnoreReturnValue` annotation the project
  declares itself (any one not from `com.google.errorprone.annotations`), which Error Prone honors
  by simple name. `"all"` and `"unused"` are already `pmd/InlineSuppression`. So a suppression
  still fails the gate, as with PMD. Code that is right despite a check takes an exception:
  `{ "rule": "errorprone/<Check>", "paths": [...], "reason": "..." }`.
  `SuppressWarningsWithoutExplanation` stays on, with a message that asks to explain an existing
  suppression in a comment and says it is not a reason to add one.
- **Lombok.** Lombok runs as an annotation processor of the second compile (Gradle's
  `annotationProcessor` path, Maven's `annotationProcessorPaths` or classpath), so `@Data`,
  `@Builder`, `@RequiredArgsConstructor`, `@Slf4j` and the rest compile. Lombok gives generated
  members the position of the annotation that asked for them, and Error Prone 2.50.0 reports one
  position per diagnostic (its start; javac's end position is the same point, so there is no span
  to compare with the annotation's). `languages/java/adapters/errorprone/lombok/` therefore drops a
  diagnostic only when both hold: its position is exactly the `@` of an annotation Lombok
  processes (an explicit list of Lombok's annotations, resolved as javac does: a single-type
  import, then a type of that name declared in the file or its package, then `import lombok.*;`, so
  a project's own `Data` annotation is not Lombok's; never inside a comment; the offset is counted
  in the source decoded with the compile's `-encoding`), and its check is one whose own findings in written code can never sit at an
  annotation, because it reports an expression or statement (`UnnecessarySemicolon`,
  `UnnecessarilyFullyQualified`, `CheckReturnValue`, `PatternMatchingInstanceof`,
  `RedundantNullCheck`, `ExtendsObject`, `UnrecognisedJavadocTag`,
  `SuppressWarningsWithoutExplanation`, and NullAway's passed or returned `@Nullable`), plus
  `PrivateConstructorForUtilityClass` at `@FieldNameConstants` (the generated `Fields` class).
  Declaration checks such as `FieldCanBeFinal` are kept even when the
  declaration starts with a Lombok annotation, and so is NullAway's uninitialized-field finding at
  `@Data` or `@NoArgsConstructor`, which NullAway reports for the same field without Lombok.
  The sources whose nearest `lombok.config` (walking up from each source's directory until
  `config.stopBubbling = true`) sets `lombok.addSuppressWarnings = false` are compiled in a pass of
  their own, against the build's classes, with the checks listed under `lombokUnsuppressedOff` in
  `checks.json` off: `StringConcatToTextBlock` and `StatementSwitchToExpressionSwitch`, which crash
  on Lombok's generated code, and `UnnecessarilyFullyQualified`, `UnrecognisedJavadocTag`,
  `MissingBraces`, `MissingSummary` and `MultiVariableDeclaration`, which then report generated
  code at the annotation or field. The other sources keep every check, and the run does not fail.
- **Overlaps.** Where Error Prone, PMD, SpotBugs or Checkstyle report the same issue, it is
  reported once: every tool stays on, and after policy a finding is dropped only while the finding
  that stands for it (its primary, in the same line, member, Javadoc comment, class, field or
  file) is reported, so an exception for the primary or a primary tool that did not run brings it
  back. The pairs, the
  scopes and what "once" covers are under "Overlaps between the tools" below.
- **Measured** (findings on the whole project, main and test code): 130 on a 57-file Maven
  calculator project built with Gradle and 46 on Spring PetClinic, against 68 and 41 before the
  overlap checks were turned back on. The rise is checks that now stand for another tool's finding
  on the same code: on the calculator `LongLiteralLowerCaseSuffix` 37, `SystemOut` 17,
  `WildcardImport` 7 and `MissingOverride` 3 in place of Checkstyle's `UpperEll` 37 and
  `AvoidStarImport` 10 and PMD's `SystemPrintln` 14 and `MissingOverride` 3; on PetClinic
  `SystemOut` 5, `EmptyBlockTag` 4, `WildcardImport` 2, `InterruptedExceptionSwallowed` 1,
  `MissingOverride` 1 and `MissingSummary` 1 in place of their PMD and Checkstyle twins, plus
  `AnnotationPosition` 1. `MethodCanBeStatic` (2 and 7) and `ThrowsUncheckedException` (0 and 3)
  are off. Over all tools the enforceable findings went from 2875 to 2871 on the calculator and
  from 4037 to 4028 on PetClinic. The `gradle-project` fixture has 1 (`UnnecessarilyFullyQualified`)
  and the `spring-project` fixture 1 (`MissingOverride`) before it held the Spring rule examples. NullAway alone: 6, 4, 0 and 0, nearly all
  `@Nullable` values returned or passed where a non-null one is declared.
- **Cost.** A second compile of main and test sources: about 6 s on the fixtures and 30 s on the
  calculator and PetClinic, most of it JVM start-up and Error Prone's own class loading.
- **Limits.** A project whose own build already runs Error Prone gets nitpicker's run in
  addition; its Error Prone jars are taken off the processor path of the second compile.
- **Tests.** `ingest/errorprone/errorprone.test.mjs` (sample report, schema validity, line-shift and
  suggested-fix stability, one finding with a stable identity for a repeated diagnostic),
  `adapters/errorprone/java-errorprone.test.mjs` (paths, source roots, missing report, the
  exceptions route on test findings of certain bugs too, JDK forms without Guava, Lombok-generated
  diagnostics),
  `adapters/errorprone/exemptions/class-exemptions.test.mjs` (which class annotations spare which
  checks), `adapters/overlaps/static-overlaps.test.mjs` (each pair drops its secondary in its scope
  and not outside it, and the table has no cycle), `resolved-overlaps.test.mjs` (the cross-tool
  lines left on the probe, the partial-coverage cases kept, the order with policy, the docs list),
  `java-spans.test.mjs` (classes, members and fields at a line), `ingest/errorprone/messages.test.mjs`
  (message rewrites, Guava suggestions without Guava), `adapters/errorprone/lombok/lombok-generated.test.mjs`
  (which positions and checks count as generated),
  `adapters/errorprone/checks/checks-policy.test.mjs` (reviewed versions equal the pinned ones on
  Gradle and Maven, every list names reviewed checks, sorted, and every check turned off, kept on
  the exceptions route or spared in annotated classes is documented below),
  `maven/errorprone/maven-compiler.test.mjs` and `maven-jdk.test.mjs` (Maven compiler settings,
  processor-path errors, the JDK check), `suppressions/errorprone/errorprone-escapes.test.mjs` and
  the inline suppression cases in `suppressions/java-suppressions.test.mjs`, and, in
  `npm run test:java`: `adapters/errorprone/error-prone.e2e.test.mjs` (an ignored `Future`, ignored results
  of the project's methods in test code, a test-only package included, a returned `null` and a
  setter bean's field in main code, and no NullAway finding for `@Autowired`, `@Value`, a JPA
  entity's fields or a `null` passed in a test, while the entity's `null` return is reported; a
  utility class is reported and a `@SpringBootApplication` or `@Configuration` class is not; a
  `@SuppressWarnings` in main code is honored; the regular classes are byte-identical; a source that
  only the second compile sees fails the build with javac's error and no report; projects on
  `--enable-preview` with `--release`, an `--add-exports` of `java.base`, and `-source`/`-target 8`
  compile), `adapters/errorprone/lombok.e2e.test.mjs` (a Lombok project on Gradle, on Gradle with
  `lombok.addSuppressWarnings = false`, and on Maven runs the whole preset with no tool error and
  only the findings in written code, `import lombok.*;` with a `@Deprecated` method included),
  `adapters/errorprone/checks/checks-catalog.e2e.test.mjs` (loads the pinned jar's checks: the
  reviewed set is the jar's, `enable` names off-by-default checks and `disable` on-by-default ones,
  `certainBugs` plus the documented ERROR checks are exactly the enabled ERROR checks,
  `suppressible` is every name of every enabled check),
  `maven/errorprone/maven-errorprone.e2e.test.mjs` (a Spring Initializr style build with a local
  parent under `spring-boot-starter-parent`, MapStruct's processor configured in the parent's
  `pluginManagement` with a property version, Lombok's appended in the child with no version, and a
  class compiled into `target/classes` before the regular compile), and
  `maven/maven-preset.e2e.test.mjs` (the same findings, Error Prone's included, from a Maven and a
  Gradle build of the same sources). The JDK choice on Gradle was checked by hand: Gradle on JDK 17
  runs Error Prone on a JDK 21 launcher, and a project with a JDK 25 toolchain on a JDK 21 Gradle
  runs it on JDK 25.

## Checks that are off

`Default` is Error Prone's own default for the check.

| Check                            | Default | Why it is off                                                                                                                                                                                                                             |
| -------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AddNullMarkedToClass`           | off     | NullAway already treats the project's packages as null-marked, so the annotation (and a JSpecify dependency) adds nothing                                                                                                                 |
| `AddNullMarkedToPackageInfo`     | off     | Same as AddNullMarkedToClass: NullAway's AnnotatedPackages already covers the project's packages                                                                                                                                          |
| `AnnotateFormatMethod`           | on      | Its allowed form is Error Prone's @FormatMethod, a dependency nitpicker does not ask for                                                                                                                                                  |
| `AnnotationMirrorToString`       | off     | Its allowed form is auto-common's AnnotationMirrors, a dependency nitpicker does not ask for                                                                                                                                              |
| `AnnotationValueToString`        | off     | Its allowed form is auto-common's AnnotationValues, a dependency nitpicker does not ask for                                                                                                                                               |
| `AvoidObjectArrays`              | off     | Its allowed form for returned arrays is Guava's ImmutableList, and pmd/UseVarargs already proposes another form for array parameters                                                                                                      |
| `BooleanParameter`               | off     | Asks for /* name= */ comments on literal arguments; the clearer fix (an enum or a named method) is outside its message                                                                                                                    |
| `CanIgnoreReturnValueSuggester`  | off     | Its allowed form is Error Prone's @CanIgnoreReturnValue, a dependency nitpicker does not ask for                                                                                                                                          |
| `CannotMockFinalClass`           | off     | Mockito 5's default inline mock maker mocks final classes, so it flags working tests                                                                                                                                                      |
| `CannotMockMethod`               | off     | Mockito 5's default inline mock maker mocks final methods, so it flags working tests                                                                                                                                                      |
| `CatchingUnchecked`              | off     | pmd/AvoidCatchingGenericException already flags catch (Exception), and this check's fix (catch RuntimeException) is forbidden there too                                                                                                   |
| `ConstantField`                  | off     | Static final fields that are not deep constants (mutable collections, loggers) may be named in CONSTANT_CASE or lowerCamelCase, Google style's choice that IdentifierName accepts; this check forces CONSTANT_CASE                        |
| `DoNotCallSuggester`             | on      | Its allowed form is Error Prone's @DoNotCall, a dependency nitpicker does not ask for                                                                                                                                                     |
| `EmptyIf`                        | off     | errorprone/UnnecessarySemicolon, which is always on, reports every if (c); at the same position with a clearer fix                                                                                                                        |
| `EqualsGetClass`                 | on      | getClass() and instanceof in equals are both valid conventions, with different semantics for subclasses                                                                                                                                   |
| `EqualsMissingNullable`          | off     | Nullness is NullAway's job here; this check only asks for an annotation                                                                                                                                                                   |
| `FieldMissingNullable`           | off     | Nullness is NullAway's job here; this check only asks for an annotation                                                                                                                                                                   |
| `IfChainToSwitch`                | on      | An if-chain and a switch are both valid forms                                                                                                                                                                                             |
| `ImmutableMemberCollection`      | off     | Its allowed form is a Guava immutable type, even in projects without Guava                                                                                                                                                                |
| `ImmutableRefactoring`           | off     | A migration to Error Prone's @Immutable annotation, a dependency nitpicker does not ask for                                                                                                                                               |
| `InlineFormatString`             | on      | A format string inline or in a named constant are both valid forms                                                                                                                                                                        |
| `InlineMeSuggester`              | on      | Its allowed form is Error Prone's @InlineMe, a dependency nitpicker does not ask for                                                                                                                                                      |
| `InterfaceWithOnlyStatics`       | off     | Duplicates pmd/ConstantsInInterface for constant interfaces, and an interface of static methods is a valid form                                                                                                                           |
| `Java8ApiChecker`                | off     | Checks compatibility with JDK 8 (Android); every Java preset project targets a newer JDK                                                                                                                                                  |
| `MethodCanBeStatic`              | off     | An instance method that uses no instance state is a valid style (it can be overridden or mocked, and reads the same as its neighbours)                                                                                                    |
| `NonApiType`                     | on      | Its collection advice duplicates pmd/LooseCoupling and its primitive-array advice needs Guava                                                                                                                                             |
| `ParameterMissingNullable`       | off     | Nullness is NullAway's job here; this check only asks for an annotation                                                                                                                                                                   |
| `PreferredInterfaceType`         | off     | Fights pmd/LooseCoupling: it asks for the concrete type that rule forbids                                                                                                                                                                 |
| `RemoveUnusedImports`            | off     | A formatter removes unused imports, so the file is already reported as unformatted; with no formatter, Checkstyle's UnusedImports reports them                                                                                            |
| `ReturnMissingNullable`          | off     | Only asks for a @Nullable annotation; NullAway reports the returned null where it matters, and the fix is often a non-null value                                                                                                          |
| `StaticOrDefaultInterfaceMethod` | off     | Forbids static and default interface methods for old Android; they are the normal form in modern Java                                                                                                                                     |
| `StringFormatWithLiteral`        | off     | Crashes Error Prone 2.50.0 (IllegalFormatConversionException) on a format string that does not match its literal arguments, failing the whole run                                                                                         |
| `ThrowsUncheckedException`       | off     | Declaring an unchecked exception in throws documents it to callers, a valid style                                                                                                                                                         |
| `TooManyParameters`              | off     | The parameter limit is the project's choice; the structure rule function-parameters-limit sets it in nitpicker.config.json                                                                                                                |
| `UnnamedVariable`                | on      | An unused variable named _ or a name are both valid forms, and its fix fights the var unused = ... form other checks ask for                                                                                                              |
| `UnnecessaryDefaultInEnumSwitch` | off     | Fights checkstyle/MissingSwitchDefault, which wants the default this check removes                                                                                                                                                        |
| `UnnecessaryFinal`               | off     | final on parameters and locals, or none, are both valid conventions; nitpicker never flags either                                                                                                                                         |
| `UnnecessaryLambda`              | on      | A lambda in a constant or helper and a method are both valid forms                                                                                                                                                                        |
| `UnusedVariable`                 | on      | Flags fields a framework reads or sets (JPA relations, @Autowired and @Value fields) with no allowed form but a suppression; PMD's UnusedPrivateField, UnusedLocalVariable, UnusedFormalParameter and UnusedAssignment cover written code |
| `UseEnumSwitch`                  | off     | An if-chain over an enum and a switch are both valid forms                                                                                                                                                                                |
| `UsingJsr305CheckReturnValue`    | off     | A migration to Error Prone's @CheckReturnValue annotation, a dependency nitpicker does not ask for                                                                                                                                        |
| `Var`                            | off     | Requires Error Prone's @Var annotation on every reassigned variable, a dependency nitpicker does not ask for                                                                                                                              |
| `VarWithPrimitive`               | off     | Fights the fix Error Prone itself suggests for an ignored primitive result (var unused = ...); int unused = ... satisfies both, but agents follow the suggestion                                                                          |
| `Varifier`                       | off     | var and the explicit type are both valid conventions; nitpicker never flags either                                                                                                                                                        |
| `VoidMissingNullable`            | off     | Nullness is NullAway's job here; this check only asks for an annotation                                                                                                                                                                   |
| `YodaCondition`                  | off     | Fights pmd/LiteralsFirstInComparisons, which wants the constant first                                                                                                                                                                     |

## ERROR checks that keep the exceptions route

ERROR-severity checks that are on but not in `certainBugs`, because they can flag correct code.
Their findings end with the exceptions route.

| Check                                   | Why it keeps the route                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AutoValueBuilderDefaultsInConstructor` | A style rule for where AutoValue builder defaults go; defaults in the constructor work                                                                 |
| `AutoValueConstructorOrderChecker`      | Matches argument names to parameter names, a heuristic that flags deliberate orders                                                                    |
| `BanClassLoader`                        | Security policy: plugin loaders and frameworks load classes on purpose                                                                                 |
| `BanJNDI`                               | Security policy: JNDI lookups are legitimate in application servers                                                                                    |
| `BanSerializableRead`                   | Security policy: reading serialized data from a trusted source is legitimate                                                                           |
| `ChainingConstructorIgnoresParameter`   | Matches parameter names, a heuristic that flags a deliberately different value                                                                         |
| `CheckReturnValue`                      | Ignoring a result on purpose is legitimate; the allowed form is var unused = ...                                                                       |
| `ClassName`                             | A file named after its first class when another top-level class is public compiles in some layouts; Checkstyle OuterTypeFilename reports the same case |
| `ComparableType`                        | Comparable over a supertype or another type can be deliberate and consistent                                                                           |
| `ConditionalExpressionNumericPromotion` | The promotion is often the intended result                                                                                                             |
| `ConstantOverflow`                      | Intended wrap-around in hash and checksum constants is correct code                                                                                    |
| `DeduplicateConstants`                  | A style suggestion: repeating a literal is correct code                                                                                                |
| `DepAnn`                                | A documentation mismatch, not a bug: the code behaves the same                                                                                         |
| `DoNotMock`                             | A library's advice against mocking a type; the mock works                                                                                              |
| `DoubleBraceInitialization`             | An anonymous subclass is sometimes intended (a serializable or overriding instance), not only a collection initializer                                 |
| `EqualsHashCode`                        | A hashCode-less equals is correct for objects never put in a hash structure (for example in a test double)                                             |
| `EqualsWrongThing`                      | Compares field names; equals over differently named but matching fields is correct                                                                     |
| `FloggerLogString`                      | A Flogger usage policy; a non-constant message logs correctly                                                                                          |
| `FunctionalInterfaceMethodChanged`      | A behavior change that can be intended                                                                                                                 |
| `GuardedBy`                             | Its lock analysis cannot follow every correct locking scheme                                                                                           |
| `GuiceInjectOnFinalField`               | Guice injects final fields; visibility is a policy concern                                                                                             |
| `HashtableContains`                     | Hashtable.contains is a correct, if old, name for containsValue                                                                                        |
| `IdentityBinaryExpression`              | x != x is the standard NaN test                                                                                                                        |
| `IdentityHashMapBoxing`                 | Boxed keys in an IdentityHashMap can be intended (cached values, identity on purpose)                                                                  |
| `Immutable`                             | Its immutability analysis rejects some correct immutable types                                                                                         |
| `ImpossibleNullComparison`              | A defensive null check on a value that cannot be null is redundant, not wrong                                                                          |
| `InsecureCryptoUsage`                   | Security policy: interoperating with an existing protocol can need the flagged algorithm                                                               |
| `IterablePathParameter`                 | A style rule about parameter types                                                                                                                     |
| `JUnit3TestNotRun`                      | Matches method names; a helper named test... is correct                                                                                                |
| `JUnit4TestNotRun`                      | Matches method names and shapes, a heuristic that flags helper methods named like tests                                                                |
| `JodaToSelf`                            | A redundant call, not a wrong one                                                                                                                      |
| `LabelledBreakTarget`                   | A style rule; a labelled block works                                                                                                                   |
| `LockOnBoxedPrimitive`                  | A risky but correct lock when the instance is private and never shared                                                                                 |
| `LoopConditionChecker`                  | Another thread can change the condition, which the check cannot see                                                                                    |
| `MisleadingEscapedSpace`                | A readability rule; the text is what the author meant                                                                                                  |
| `ModifyingCollectionWithItself`         | list.addAll(list) and similar calls can be intended                                                                                                    |
| `MustBeClosedChecker`                   | Ownership can pass to a caller or a framework that closes the resource                                                                                 |
| `NoCanIgnoreReturnValueOnClasses`       | A style rule about where the annotation goes                                                                                                           |
| `NonCanonicalStaticImport`              | A style rule; the import compiles to the same member                                                                                                   |
| `NullArgumentForNonNullParameter`       | A negative test passes null on purpose to check the failure                                                                                            |
| `NullTernary`                           | Fires on conditionals the code never unboxes on the null branch                                                                                        |
| `OptionalMapUnusedValue`                | A style rule: map with an unused value works                                                                                                           |
| `OptionalOfRedundantMethod`             | A redundant call, not a wrong one                                                                                                                      |
| `PackageInfo`                           | A style rule about package-info.java contents                                                                                                          |
| `ProtoBuilderReturnValueIgnored`        | build() for its validation alone is intended                                                                                                           |
| `ProtocolBufferOrdinal`                 | ordinal() is correct where the enum order is what the code wants                                                                                       |
| `RefersToDaggerCodegen`                 | A Dagger policy; tests and wiring code refer to generated code on purpose                                                                              |
| `RestrictedApi`                         | An API owner's allowlist; an allowed caller outside it is a review question, not a bug                                                                 |
| `ReturnValueIgnored`                    | Ignoring a result on purpose is legitimate; the allowed form is var unused = ...                                                                       |
| `SelfComparison`                        | Tests of compareTo reflexivity compare an object with itself on purpose                                                                                |
| `SelfEquals`                            | Tests of equals reflexivity compare an object with itself on purpose                                                                                   |
| `StaticQualifiedUsingExpression`        | A style rule; the static member is the same                                                                                                            |
| `SubstringOfZero`                       | A redundant call, not a wrong one                                                                                                                      |
| `SystemExitOutsideMain`                 | Command-line tools and launchers exit outside main on purpose                                                                                          |
| `TestExceptionChecker`                  | A style rule; @Test(expected = ...) works                                                                                                              |
| `UnicodeInCode`                         | Non-ASCII identifiers and literals are legal Java                                                                                                      |
| `UnnecessaryCheckNotNull`               | A redundant check, not a wrong one                                                                                                                     |
| `UnnecessaryTypeArgument`               | A redundant type argument, not a wrong one                                                                                                             |
| `UnsafeWildcard`                        | Flags wildcard types that are correct in the code at hand                                                                                              |
| `UnusedAnonymousClass`                  | An anonymous class created for its constructor's side effect is intended                                                                               |
| `UseCorrectAssertInTests`               | A style rule; assert in a test runs with -ea, which build tools set                                                                                    |
| `ZoneIdOfZ`                             | ZoneId.of("Z") is correct, only less direct than ZoneOffset.UTC                                                                                        |

## Overlaps between the tools

No Error Prone, PMD, SpotBugs or Checkstyle rule is turned off because one of the others reports
the same code: there is no SpotBugs exclude file, and the PMD ruleset leaves out only the
test-style rules named in its header. (Two Error Prone checks are still off as repeats:
`RemoveUnusedImports`, whose unused import google-java-format already reports as an unformatted
file (with no formatter, Checkstyle's `UnusedImports` reports it), and `EmptyIf`, whose `if (c);` Error Prone's own `UnnecessarySemicolon` reports at the same
position.) Instead, `languages/java/adapters/overlaps/overlap-pairs.json` lists pairs of a
primary rule and the secondary rules it stands for, with a scope:

- `line`: the same file and line.
- `member`: the same method, constructor or field initializer, from a scan of the source that skips
  braces in comments, strings, characters and text blocks (`java-spans.mjs`).
- `javadoc`: the same Javadoc comment, whichever of its lines each tool names (Checkstyle's
  `SummaryJavadoc` reports the comment's first line, Error Prone's `MissingSummary` can name a
  later one, such as the line of an `@author` tag).
- `class`: the same class; a nested class is its own class.
- `field`: the same class and field name. SpotBugs names a field `pkg.Class.field` and often gives
  it no line, or the line of a write.
- `file`: the same file. Error Prone's `WildcardImport` reports a file once, at its first wildcard
  import, and its fix replaces them all, so it stands for every Checkstyle `AvoidStarImport` in
  the file.

`withoutOverlaps` (`static-overlaps.mjs`) runs in `collectJavaFindings`, on the base and the head
alike, after the policy's `exclude` and `exceptions` and before the legacy inventory. A secondary
finding is dropped only when a primary finding in the same scope is itself reported. So an
exception for the primary, a primary tool that did not run (NullAway without packages) or a primary dropped for its own
primary brings the secondary back, while a baselined primary still stands for its secondary, so a
baselined issue does not come back under another tool's name. The primary is the finding with the
clearest message: usually the Error Prone check with its fix over a SpotBugs pattern, the specific
check over the general one (`OptionalEquality` or `BoxedPrimitiveEquality` over
`ReferenceEquality`, over PMD's `CompareObjectsWithEquals` and SpotBugs `ES_COMPARING_*`), and the fullest switch check over the
rest (`MissingCasesInEnumSwitch` over `NonExhaustiveSwitch`, `MissingDefault`, Checkstyle's
`MissingSwitchDefault` and `SF_SWITCH_NO_DEFAULT`).

Where the primary covers only some of the secondary's cases, both stay on and the secondary is
dropped only in the scope the two share: `RV_RETURN_VALUE_IGNORED` on a method Error Prone's
`ReturnValueIgnored` does not know, `DM_DEFAULT_ENCODING` where `DefaultCharset` is silent,
`SS_SHOULD_BE_STATIC`, `RE_POSSIBLE_UNINTENDED_PATTERN`, `DMI_COLLECTION_OF_URLS`, `HE_*`,
`SR_NOT_CHECKED`, `NP_TOSTRING_COULD_RETURN_NULL`, PMD's `ReturnEmptyCollectionRatherThanNull` on a
method NullAway does not check, and `StringCharset` on a call `JdkObsolete` does not flag. `NM_BAD_EQUAL` (an `equal` method) is in no pair and stays on. The kotlin preset runs the same
step; with no Error Prone, PMD or Checkstyle on Kotlin sources, SpotBugs findings in Kotlin files
always stay.

"Reported once" is per pair. Two tools can still report one line when they name different issues;
on the probe project those are, among others, `LooseCoupling` and `JdkObsolete` on a `Vector`
field, `HidingField` and `URF_UNREAD_PUBLIC_OR_PROTECTED_FIELD`, `RandomModInteger` and
`DMI_RANDOM_USED_ONLY_ONCE`, `ClassNewInstance` and `REFLC_REFLECTION_MAY_INCREASE_ACCESSIBILITY_OF_CLASS`,
`SelfAssignment` and `AvoidReassigningParameters`. `adapters/overlaps/resolved-overlaps.test.mjs` pins every cross-tool line left
on the probe's findings (`fixtures/probe-findings.json`, every enabled check with nothing turned off
for overlap), the pairs that drop a secondary on those findings (every pair of the table must have probe
evidence, so a new pair comes with a probe source that makes both rules report the same site),
the partial-coverage cases kept,
and the policy order; `static-overlaps.test.mjs` checks each pair in its scope; a unit test checks
that this list is the table.

`fixtures/probe-findings.json` holds the probe sources (`sources`) and the findings of a full Java
preset run over them with overlap resolution off (`findings`: tool, rule, path, line, and the symbol
of a SpotBugs finding), sorted so a run is reproducible. Do not edit the findings by hand after a
tool upgrade or a new pair: `npm run gen:overlap-probe` copies the sources into a throwaway Gradle
project (`adapters/fixtures/gradle-project` with JUnit 4 and JSpecify added), runs the Java preset
with the pinned tools on it (`collectJavaFindings` with `resolveOverlaps` set to the identity;
this needs a JDK 21 and Gradle, and takes several minutes) and rewrites the file. `-- --build=maven`
runs the same sources as a Maven project (`maven/fixtures/single/pom.xml` with the same two
dependencies) instead, and `--gradle=<command>` or `--maven=<command>` names another Gradle or Maven.
The overlap table serves both builds, so both must report the same findings. To probe a new case,
add the source file to `sources` first and run the command. `node scripts/gen-overlap-probe.mjs
--check` writes nothing and exits 1 with the added and removed findings when the committed file
differs from a fresh run; `adapters/java-e2e/overlap-probe.e2e.test.mjs` runs the same check for
Gradle and for Maven in the Java end-to-end suite (`npm run test:java`), so the Java CI job fails on
drift and on a finding one build reports and the other does not. After a regeneration, review the
diff: a disappearing finding is a rule turned off or changed in the preset, and every pair must
still match (the pair test above).

Two pairs were dropped and one changed because the two rules could never report one site with the
preset's configuration, found by probing each pair. `errorprone/AnnotationPosition` over
Checkstyle's `AnnotationLocation` is gone: both suppression files turn `AnnotationLocation` off,
so Checkstyle never reports it. `errorprone/HardCodedSdCardPath` over PMD `DoNotHardCodeSDCard`
is gone: the Error Prone check reports only under the javac option `-XDandroidCompatible=true`,
which the runner does not set, so only PMD reports a hard-coded `/sdcard` path.
`errorprone/ClassName` over `checkstyle/OuterTypeFilename` has the `file` scope: Error Prone names
the first line of the file and Checkstyle the class line. SpotBugs reports `MS_MUTABLE_ARRAY` and
`MS_PKGPROTECT` for a public static final array only when something reads the field (outside its
package for the first, inside it for the second), so the probe has a class that reads them.
`pmd/ClassLoadEffect` over `spotbugs/SC_START_IN_CTOR` is matched by a constructor that starts a
thread and runs for a static field: both name the `start()` line.

The pairs:

- line: `errorprone/ArrayHashCode` over `spotbugs/DMI_INVOKING_HASHCODE_ON_ARRAY`
- line: `errorprone/ArrayEquals` over `spotbugs/EC_BAD_ARRAY_COMPARE`
- line: `errorprone/ArrayToString` over `spotbugs/DMI_INVOKING_TOSTRING_ON_ARRAY`
- line: `errorprone/EqualsUnsafeCast` over `spotbugs/BC_EQUALS_METHOD_SHOULD_WORK_FOR_ALL_OBJECTS`, `spotbugs/NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT`
- line: `errorprone/DoubleCheckedLocking` over `spotbugs/DC_DOUBLECHECK`, `spotbugs/IS2_INCONSISTENT_SYNC`
- line: `errorprone/DefaultCharset` over `spotbugs/DM_DEFAULT_ENCODING`
- line: `errorprone/EqualsIncompatibleType` over `spotbugs/EC_UNRELATED_TYPES`
- line: `errorprone/CollectionIncompatibleType` over `spotbugs/GC_UNRELATED_TYPES`
- line: `errorprone/BadShiftAmount` over `spotbugs/ICAST_BAD_SHIFT_AMOUNT`
- line: `errorprone/NarrowCalculation` over `spotbugs/ICAST_IDIV_CAST_TO_DOUBLE`
- line: `errorprone/IntLongMath`, `errorprone/NarrowCalculation` over `spotbugs/ICAST_INTEGER_MULTIPLY_CAST_TO_LONG`
- line: `errorprone/IntLongMath` over `errorprone/NarrowCalculation`
- line: `errorprone/InfiniteRecursion` over `spotbugs/IL_INFINITE_RECURSIVE_LOOP`
- line: `errorprone/ComparisonOutOfRange` over `spotbugs/INT_BAD_COMPARISON_WITH_SIGNED_BYTE`
- line: `errorprone/NonFinalStaticField` over `spotbugs/MS_FINAL_PKGPROTECT`, `spotbugs/MS_SHOULD_BE_FINAL`, `errorprone/FieldCanBeFinal`
- line: `errorprone/MutablePublicArray` over `spotbugs/MS_MUTABLE_ARRAY`, `spotbugs/MS_PKGPROTECT`
- line: `errorprone/NullAway` over `pmd/NullAssignment`, `pmd/ReturnEmptyCollectionRatherThanNull`
- line: `errorprone/InvalidPatternSyntax` over `spotbugs/RE_BAD_SYNTAX_FOR_REGULAR_EXPRESSION`
- line: `errorprone/BareDotMetacharacter` over `spotbugs/RE_POSSIBLE_UNINTENDED_PATTERN`
- line: `errorprone/RandomCast` over `spotbugs/RV_01_TO_INT`
- line: `errorprone/MathAbsoluteNegative` over `spotbugs/RV_ABSOLUTE_VALUE_OF_RANDOM_INT`
- line: `errorprone/DeadException` over `spotbugs/RV_EXCEPTION_NOT_THROWN`
- line: `errorprone/CheckReturnValue`, `errorprone/ReturnValueIgnored` over `spotbugs/RV_RETURN_VALUE_IGNORED`, `pmd/UselessOperationOnImmutable`
- line: `errorprone/SelfAssignment` over `spotbugs/SA_FIELD_SELF_ASSIGNMENT`, `spotbugs/SA_LOCAL_SELF_ASSIGNMENT`, `pmd/IdempotentOperations`
- line: `pmd/CheckSkipResult` over `spotbugs/SR_NOT_CHECKED`
- line: `errorprone/FieldCanBeStatic` over `spotbugs/SS_SHOULD_BE_STATIC`
- line: `errorprone/UnnecessarySemicolon` over `spotbugs/UCF_USELESS_CONTROL_FLOW_NEXT_LINE`, `checkstyle/NeedBraces`, `errorprone/MissingBraces`
- line: `checkstyle/NeedBraces` over `errorprone/MissingBraces`
- line: `errorprone/LockNotBeforeTry` over `spotbugs/UL_UNRELEASED_LOCK`, `spotbugs/UL_UNRELEASED_LOCK_EXCEPTION_PATH`
- line: `errorprone/WaitNotInLoop` over `spotbugs/UW_UNCOND_WAIT`, `spotbugs/WA_NOT_IN_LOOP`
- line: `errorprone/NonAtomicVolatileUpdate` over `spotbugs/VO_VOLATILE_INCREMENT`
- line: `errorprone/SubstringOfZero` over `spotbugs/DMI_USELESS_SUBSTRING`
- line: `errorprone/IdentityBinaryExpression`, `errorprone/SelfComparison`, `errorprone/SelfEquals` over `spotbugs/SA_FIELD_SELF_COMPARISON`, `spotbugs/SA_LOCAL_SELF_COMPARISON`
- line: `errorprone/LockOnBoxedPrimitive` over `spotbugs/DL_SYNCHRONIZATION_ON_*`
- line: `errorprone/BoxedPrimitiveConstructor` over `spotbugs/DM_FP_NUMBER_CTOR`, `spotbugs/DM_NUMBER_CTOR`, `pmd/PrimitiveWrapperInstantiation`
- line: `errorprone/DoNotCall` over `spotbugs/RU_INVOKE_RUN`, `pmd/DontCallThreadRun`
- line: `errorprone/EqualsNaN` over `spotbugs/FE_TEST_IF_EQUAL_TO_NOT_A_NUMBER`, `pmd/ComparisonWithNaN`
- line: `errorprone/BoxedPrimitiveEquality`, `errorprone/MemorySegmentReferenceEquality`, `errorprone/OptionalEquality`, `errorprone/ProtoStringFieldReferenceEquality` over `errorprone/ReferenceEquality`
- line: `errorprone/BoxedPrimitiveEquality`, `errorprone/MemorySegmentReferenceEquality`, `errorprone/OptionalEquality`, `errorprone/ProtoStringFieldReferenceEquality`, `errorprone/ReferenceEquality` over `spotbugs/ES_COMPARING_*`, `spotbugs/RC_REF_COMPARISON*`, `pmd/CompareObjectsWithEquals`, `pmd/UseEqualsToCompareStrings`
- line: `pmd/UseEqualsToCompareStrings` over `pmd/CompareObjectsWithEquals`, `spotbugs/ES_COMPARING_*`
- line: `pmd/InstantiationToGetClass` over `spotbugs/DM_NEW_FOR_GETCLASS`
- line: `pmd/MethodReturnsInternalArray` over `spotbugs/EI_EXPOSE_REP`
- line: `pmd/ArrayIsStoredDirectly` over `spotbugs/EI_EXPOSE_REP2`
- line: `errorprone/MissingCasesInEnumSwitch` over `pmd/NonExhaustiveSwitch`, `errorprone/MissingDefault`, `checkstyle/MissingSwitchDefault`, `spotbugs/SF_SWITCH_NO_DEFAULT`
- line: `pmd/NonExhaustiveSwitch` over `errorprone/MissingDefault`, `checkstyle/MissingSwitchDefault`, `spotbugs/SF_SWITCH_NO_DEFAULT`
- line: `errorprone/MissingDefault` over `checkstyle/MissingSwitchDefault`, `spotbugs/SF_SWITCH_NO_DEFAULT`
- line: `checkstyle/MissingSwitchDefault` over `spotbugs/SF_SWITCH_NO_DEFAULT`
- line: `errorprone/FallThrough` over `pmd/ImplicitSwitchFallThrough`, `checkstyle/FallThrough`
- line: `pmd/ImplicitSwitchFallThrough` over `checkstyle/FallThrough`
- member: `errorprone/FallThrough`, `pmd/ImplicitSwitchFallThrough`, `checkstyle/FallThrough` over `spotbugs/SF_SWITCH_FALLTHROUGH`
- line: `errorprone/EmptyCatch` over `pmd/EmptyCatchBlock`, `checkstyle/EmptyCatchBlock`
- line: `pmd/EmptyCatchBlock` over `checkstyle/EmptyCatchBlock`
- line: `errorprone/MultiVariableDeclaration` over `pmd/OneDeclarationPerLine`, `checkstyle/MultipleVariableDeclarations`
- line: `pmd/OneDeclarationPerLine` over `checkstyle/MultipleVariableDeclarations`
- line: `errorprone/InterruptedExceptionSwallowed` over `pmd/AvoidCatchingGenericException`
- line: `errorprone/IdentifierName` over `checkstyle/CatchParameterName`, `checkstyle/LambdaParameterName`, `checkstyle/LocalVariableName`, `checkstyle/MemberName`, `checkstyle/MethodName`, `checkstyle/ParameterName`, `checkstyle/PatternVariableName`, `checkstyle/RecordComponentName`
- line: `errorprone/TypeParameterNaming` over `checkstyle/ClassTypeParameterName`, `checkstyle/InterfaceTypeParameterName`, `checkstyle/MethodTypeParameterName`, `checkstyle/RecordTypeParameterName`
- file: `errorprone/WildcardImport` over `checkstyle/AvoidStarImport`
- line: `errorprone/LongLiteralLowerCaseSuffix` over `checkstyle/UpperEll`
- line: `errorprone/MixedArrayDimensions` over `checkstyle/ArrayTypeStyle`
- line: `errorprone/BigDecimalLiteralDouble` over `pmd/AvoidDecimalLiteralsInBigDecimalConstructor`, `spotbugs/DMI_BIGDECIMAL_CONSTRUCTED_FROM_DOUBLE`
- line: `errorprone/StringBuilderInitWithChar` over `pmd/StringBufferInstantiationWithChar`
- line: `pmd/EqualsNull` over `errorprone/EqualsNull`, `spotbugs/EC_NULL_ARG`
- line: `errorprone/EqualsNull` over `spotbugs/EC_NULL_ARG`
- line: `errorprone/ExplicitArrayForVarargs` over `pmd/UnnecessaryVarargsArrayCreation`
- line: `errorprone/SystemExitOutsideMain` over `pmd/DoNotTerminateVM`, `spotbugs/DM_EXIT`
- line: `pmd/DoNotTerminateVM` over `spotbugs/DM_EXIT`
- line: `pmd/ClassLoadEffect` over `spotbugs/SC_START_IN_CTOR`
- line: `errorprone/CatchAndPrintStackTrace` over `pmd/AvoidPrintStackTrace`, `errorprone/SystemOut`
- line: `errorprone/SystemOut` over `pmd/SystemPrintln`
- line: `errorprone/MissingOverride` over `pmd/MissingOverride`
- line: `pmd/DefaultLabelNotLastInSwitch` over `errorprone/SwitchDefault`
- line: `checkstyle/JavadocMethod` over `errorprone/InvalidParam`
- line: `errorprone/ReturnFromVoid` over `checkstyle/JavadocMethod`
- line: `errorprone/NotJavadoc` over `checkstyle/InvalidJavadocPosition`
- line: `errorprone/EmptyBlockTag` over `checkstyle/NonEmptyAtclauseDescription`
- javadoc: `errorprone/MissingSummary` over `checkstyle/SummaryJavadoc`
- file: `errorprone/ClassName` over `checkstyle/OuterTypeFilename`
- line: `errorprone/AssignmentExpression` over `pmd/AssignmentInOperand`
- line: `errorprone/ForEachIterable` over `pmd/ForLoopCanBeForeach`
- line: `errorprone/Finally` over `pmd/DoNotThrowExceptionInFinally`, `pmd/ReturnFromFinallyBlock`
- member: `errorprone/DoubleBraceInitialization` over `pmd/DoubleBraceInitialization`
- line: `errorprone/JdkObsolete` over `pmd/ReplaceEnumerationWithIterator`, `pmd/ReplaceHashtableWithMap`, `pmd/ReplaceVectorWithList`, `pmd/UseArrayListInsteadOfVector`
- line: `errorprone/JdkObsolete` over `errorprone/StringCharset`
- line: `errorprone/NonOverridingEquals` over `pmd/SuspiciousEqualsMethodName`
- line: `errorprone/DefaultLocale` over `pmd/SimpleDateFormatNeedsLocale`
- line: `pmd/LegacyCalendarApi` over `pmd/AvoidCalendarDateCreation`, `pmd/SimpleDateFormatNeedsLocale`, `errorprone/DefaultLocale`, `errorprone/DateFormatConstant`
- line: `pmd/UnclosedInlineResource` over `spotbugs/OS_OPEN_STREAM`, `spotbugs/ODR_OPEN_DATABASE_RESOURCE`, `spotbugs/OBL_UNSATISFIED_OBLIGATION`
- line: `pmd/UseLocaleWithCaseConversions` over `errorprone/StringCaseLocaleUsage`
- line: `spotbugs/ST_WRITE_TO_STATIC_FROM_INSTANCE_METHOD` over `errorprone/StaticAssignmentInConstructor`, `pmd/AssignmentToNonFinalStatic`
- line: `errorprone/StaticAssignmentInConstructor` over `pmd/AssignmentToNonFinalStatic`
- line: `pmd/UnitTestShouldUseBeforeAnnotation` over `errorprone/JUnit4SetUpNotRun`, `errorprone/JUnit4TestNotRun`, `pmd/DetachedTestCase`
- line: `pmd/UnitTestShouldUseAfterAnnotation` over `errorprone/JUnit4TearDownNotRun`, `errorprone/JUnit4TestNotRun`, `pmd/DetachedTestCase`
- line: `pmd/DetachedTestCase`, `errorprone/JUnit4SetUpNotRun`, `errorprone/JUnit4TearDownNotRun` over `errorprone/JUnit4TestNotRun`
- line: `errorprone/EqualsHashCode` over `pmd/OverrideBothEqualsAndHashcode`
- line: `pmd/UnusedPrivateMethod` over `errorprone/UnusedMethod`
- member: `pmd/PreserveStackTrace` over `errorprone/UnusedException`
- member: `pmd/AvoidReassigningLoopVariables` over `errorprone/IncrementInForLoopAndHeader`
- line: `errorprone/Finalize` over `pmd/EmptyFinalizer`, `spotbugs/FI_EMPTY`
- member: `errorprone/Finalize` over `checkstyle/NoFinalizer`
- class: `errorprone/UngroupedOverloads` over `checkstyle/OverloadMethodsDeclarationOrder`
- file: `checkstyle/OneTopLevelClass` over `errorprone/MultipleTopLevelClasses`
- file: `errorprone/SunApi` over `pmd/DontImportSun`
- member: `errorprone/EqualsHashCode`, `pmd/OverrideBothEqualsAndHashcode` over `spotbugs/HE_*`
- member: `errorprone/NullAway`, `errorprone/ToStringReturnsNull` over `spotbugs/NP_TOSTRING_COULD_RETURN_NULL`
- member: `errorprone/NullAway` over `errorprone/ToStringReturnsNull`
- member: `errorprone/NonOverridingEquals` over `spotbugs/EQ_SELF_NO_OBJECT`, `spotbugs/EQ_SELF_USE_OBJECT`
- member: `errorprone/SynchronizeOnNonFinalField` over `spotbugs/ML_SYNC_ON_FIELD_TO_GUARD_CHANGING_THAT_FIELD`
- field: `errorprone/URLEqualsHashCode` over `spotbugs/DMI_COLLECTION_OF_URLS`
- field: `pmd/UnusedPrivateField` over `spotbugs/URF_UNREAD_FIELD`, `spotbugs/UUF_UNUSED_FIELD`
- field: `errorprone/NullAway` over `spotbugs/NP_UNWRITTEN_FIELD`, `spotbugs/UWF_UNWRITTEN_FIELD`
- member: `errorprone/DoubleCheckedLocking` over `pmd/DoubleCheckedLocking`
- line: `pmd/StringInstantiation` over `spotbugs/DM_STRING_CTOR`, `spotbugs/DM_STRING_VOID_CTOR`
- line: `pmd/UseStringBufferForStringAppends` over `spotbugs/SBSC_USE_STRINGBUFFER_CONCATENATION`
- line: `pmd/UnsynchronizedStaticFormatter` over `spotbugs/STCAL_INVOKE_ON_STATIC_DATE_FORMAT_INSTANCE`
- class: `errorprone/DateFormatConstant` over `pmd/UnsynchronizedStaticFormatter`, `spotbugs/STCAL_INVOKE_ON_STATIC_DATE_FORMAT_INSTANCE`
- field: `errorprone/DateFormatConstant` over `spotbugs/STCAL_STATIC_SIMPLE_DATE_FORMAT_INSTANCE`
- line: `pmd/NonThreadSafeSingleton` over `spotbugs/LI_LAZY_INIT_STATIC`, `spotbugs/SING_SINGLETON_GETTER_NOT_SYNCHRONIZED`

## Checks spared in annotated classes

`classExemptions` in `checks.json`; a unit test checks that this table lists exactly its checks.

| Check                               | Spared in classes annotated                                                                       | Why                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `FieldCanBeFinal`                   | `@Entity`, `@Embeddable`, `@MappedSuperclass` (jakarta and javax persistence)                     | JPA forbids final persistent fields                                                                  |
| `IdentifierName`                    | `@AnalyzeClasses`                                                                                 | ArchUnit names a rule after its `@ArchTest` field, and its convention is a lower_snake_case sentence |
| `PrivateConstructorForUtilityClass` | `@Configuration` (and so `@SpringBootApplication`, `@SpringBootConfiguration`), `@AnalyzeClasses` | Spring's CGLIB proxy and ArchUnit's runner need a non-private constructor                            |
