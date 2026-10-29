---
name: nitpicker-java
description: Use before writing or changing Java in a project that runs nitpicker with the java preset (or Java sources under the kotlin preset), so the code follows nitpicker's one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for Java

nitpicker gates a Gradle or Maven project (Java 21) with PMD, SpotBugs, Error Prone with NullAway,
Checkstyle, google-java-format, JaCoCo, CRAP, PIT mutation testing, jscpd and size limits. It fails
only on findings your change adds, so leave code the task doesn't need alone. Write the allowed
forms below from the start; the gate is a backstop.

## Finish with the gate

1. Run the project's tests (`./gradlew test`, or `./mvnw test` on Maven). Failing tests or compile
   errors make the gate exit 2.
2. Format with the formatter the run names under "Following this project's conventions": the
   project's own formatter task, or google-java-format 1.25.2 with `--replace` (plus `--aosp` for
   the aosp style), or palantir-java-format with `--palantir --replace`. When the run says no
   Java formatter runs, there is nothing to run; keep the layout by hand. `npx nitpicker --fix`
   does not touch Java.
3. Run `npx nitpicker` as a background command you wait on, without a pipe: you need its exit
   code. It runs the build on the merge base and on head and takes minutes. It uses the project's
   `./gradlew` or `./mvnw` when there is one, otherwise `gradle` or `mvn` from the PATH
   (`NITPICKER_GRADLE` or `NITPICKER_MAVEN` overrides both).
4. Act on the exit code:
   - 0: done.
   - 1: fix every new finding (printed as `tool/rule path:line`) and any tool error listed below
     them, then rerun.
   - 2: no new findings, but a tool failed (the build, a compile error, a test failure). Fix the
     cause it names and rerun. Exit 2 is never a pass. If another run is in progress, wait for
     it; never kill it.
5. Never suppress: no `// NOPMD`, `@SuppressWarnings`, `@SuppressFBWarnings`, `CHECKSTYLE`
   comments, config `exclude`/`disable`/`exceptions`, legacy entries, or weakened tests. The one
   exception is `@SuppressWarnings("PMD.SpringDataNativeQuery")` on a repository method with native
   SQL ([spring.md](spring.md)). If a finding seems wrong, stop and ask. Never pass
   `--accept-policy-change` or set `NITPICKER_ACCEPT_POLICY_CHANGE`: a
   `nitpicker-config/policy-loosened` finding is for a person to accept.

With Spring on the classpath, also follow [spring.md](spring.md).

Before you change code other modules use, or fix a bug, read
[beyond-the-gate.md](beyond-the-gate.md).

## Write it this way

- Style is google-java-format, 100 columns, unless the project formats with palantir-java-format
  (120 columns, 4 spaces). Indent like the files around you (nitpicker follows the project's
  formatter and majority, 2 spaces or 4 with `--aosp`); a misformatted file is one finding, so run the
  formatter rather than fixing layout by hand. With no formatter, nitpicker still reports unused
  imports and bad indentation or whitespace; in a tab-indented project it checks neither tabs nor
  indentation.
- Text: `"a".equals(x)` or `a.equals(b)`, never `==` on strings or other objects. Pass a charset and
  a locale: `s.getBytes(StandardCharsets.UTF_8)`, `s.toUpperCase(Locale.ROOT)`.
- Strings, arrays and files: no field initializer that repeats the default (`= 0`, `= null`,
  `= false`). Append one character as a char (`append('x')`) and chain appends
  (`sb.append(a).append(b)`). Write `i + "x"`, not `"" + i + "x"`; `String.valueOf(i)` only when
  nothing else is concatenated. Build loop output in a local `StringBuilder`. Copy arrays with
  `System.arraycopy`, and an array into a collection with `Collections.addAll(target, array)`. Open
  files with `Files.newInputStream` or `Files.newBufferedReader`, not `FileInputStream`.
- Threads: no `synchronized`, `wait` or `notify`. Lock with a private final `ReentrantLock`
  (`lock()` right before `try`, `unlock()` in `finally`) and wait on a `Condition` from it
  (`await()` in a loop, `signalAll()`).
- Output: no `System.out`/`System.err` and no `printStackTrace()`. Log with
  `System.getLogger(Foo.class.getName())`, or the project's logger.
- Null: a method returning a collection returns an empty one (`List.of()`), never `null`. Any
  other value that may be absent is declared `@Nullable` (the project's annotation, JSpecify's
  `org.jspecify.annotations.Nullable` if it has none) and checked before use. Never assign `null`
  (`out = null`); restructure instead.
- Literals: compare against named constants (`quantity >= BULK_THRESHOLD`), not literals in an
  `if`; `-1`, `0`, `1` and `2` are fine.
- Parameters and loops: never reassign a parameter or a catch variable; copy to a local. Use
  for-each where the index is unused. Remove unused fields, locals, private methods, assignments.
- Types: declare interfaces (`List<String> out = new ArrayList<>()`, not `ArrayList<String> out`).
- Mutable state: don't return or store a caller's array or collection directly. Return
  `data.clone()` or `List.copyOf(items)`, and copy in the constructor.
- Data and results: `record` for data, a `sealed interface` of records for an outcome, and an
  exhaustive `switch` expression over it. A `switch` statement needs `default`.
- Enums: to sort the constants of one of your enums into two groups, classify every constant: a
  `switch` expression without `default`, or a field each constant declares (`PAID(true)`). Not
  `s == PAID || s == SHIPPED` or `EnumSet.of(...).contains(s)` (`ExhaustiveEnumPredicate`).
- No static method that only passes its parameters on to another method; call that method.
  Factories named `of` or `from` and copies such as `List.copyOf` are fine.
- A record or `@ConfigurationProperties` class (and the classes nested in it) has `tags` or `tag`,
  not both; one item is a one-element list.
- A main class only tests use belongs in the test sources (`coupling/test-only-export`).
- With jMolecules (`AggregateRoot`, `Entity`, `ValueObject` or their annotations), an aggregate holds
  another aggregate only by its identifier or an `Association<T, ID>`, an entity sits in one
  aggregate, and a value object holds identifiers, not entities (`archunit/ddd-...`).
- Resources: try-with-resources for anything `Closeable`. No `finally` that returns or throws.
  Wait for a task that uses a resource inside its try block, after starting it and not under an `if` or loop
  (`get()`/`join()`, `awaitTermination`, `take()`, a latch `await()`, or declare the executor as a later
  resource); `pmd/TaskOutlivesTryResource` reports a task that can outlive the close.
- Utility classes: a `final` class of static methods with a `private` empty constructor.
- Dependencies between packages follow the project's ArchUnit rules (classes named `*ArchTest` or
  `*ArchitectureTest`); read them before importing across packages. A package must not depend on a
  less stable one (`stability-direction`).
- Names and declarations: abbreviations are words (`parseUrl`, `HttpClient`, `userId`, never
  `parseURL`). Declare a local next to its first use, one variable per declaration, and keep
  overloads next to each other. Mark overrides `@Override`. Never reassign a loop variable, and
  never call `System.exit`. A trailing array parameter is varargs (`String... names`).
- Javadoc is optional; when you write it, the first sentence is a real summary (not `@return`),
  every `@param`/`@return` has a description, in that order, and paragraphs start with `<p>`.
- nitpicker runs its own PMD rules (errorprone, bestpractices, performance, multithreading,
  security and a broad-catch rule) and Google checks. A project's `config/pmd/ruleset.xml` or
  `config/checkstyle/checkstyle.xml` counts only when `nitpicker.config.json` opts in under
  `tools`; then read it too.

## Errors

- Never swallow: no empty `catch` (PMD `EmptyCatchBlock` and Checkstyle both fail it). A `catch`
  returns a failure value, logs and recovers, or rethrows with the cause:
  `throw new IllegalStateException("bad quantity " + text, e);` (`PreserveStackTrace`).
- Catch the narrowest type: `catch (NumberFormatException e)`. `catch (Exception)`,
  `catch (RuntimeException)`, `catch (Throwable)` and `catch (NullPointerException)` fail. Keep
  the `try` around the one call that throws.
- Expected failures are values: a `sealed interface` result returning
  `new QuantityParse.Invalid(text)` beats throwing.

## Structure limits

- A method in main sources: at most 50 lines, 15 statements, control nesting 2, 3 parameters. Each lambda and each static or instance
  initializer block is a unit with the same limits, counted on its own and not toward the method around it. Return early instead of nesting; past 3 parameters, pass a `record`.
- A file: at most 300 lines (test file 500). A folder: at most 6 source files and, separately, 6
  test files directly in it; group the rest into sub-packages.
- Keep classes small: split by responsibility and prefer holding a collaborator to extending one.
- Cyclomatic complexity 9 or more fails `crap-score-limit` even when fully covered; less
  coverage lowers the ceiling (`ccn^2 * (1 - coverage)^3 + ccn < 9`). Split branchy methods.
- A new clone of at least 5 lines and 50 tokens in main sources (`duplicate-clone`) fails, also
  when the copy has other names and literals: extract a method.

## Tests

- Every branch you add needs a test, both outcomes of each `if`, `?:` and `catch`: each changed
  line must have at least 95% of its branches covered (`changed-branch-coverage`).
- Mutation testing runs on your change. Assert exact values and test both sides of each boundary
  (`discountCents(1000, 10)` and `(1000, 9)`); a new mutant that survives or has no test
  (`mutant-survived`, `mutant-nocoverage`) fails. If no input can kill a mutant, the code is
  redundant: delete or simplify it. A `compareTo` boundary or an ignored lambda result that truly
  cannot be told apart takes an exception for `pit/mutant-survived`.
- Plan tests to be fast (`slow-test`): a fake clock instead of `Thread.sleep`, a test
  slice instead of `@SpringBootTest`.
- Never wait a fixed time (`FixedSleepInTest`): wait on the condition with Awaitility when the
  tests use it (`await().atMost(Duration.ofSeconds(5)).until(...)`), otherwise in a loop against a
  deadline; `verify(mock, timeout(1000))` for a mock, not `after(1000)`. `parkNanos` and
  `pollDelay(...).until(() -> true)` are fixed waits too. `join(ms)` and `wait(ms)` are timed
  waits: they return early, but the test goes on unchecked when the time runs out, so assert the
  result of `join(Duration)` or of a latch `await`. A sleep that simulates slow work in a mock
  answer, a thread body or a test fake that implements or extends a main class is fine. To
  show something does not happen, give the code a `Clock` or scheduler the test moves forward, not
  `after(ms).never()` or `during(...)` (`NegativeWaitInTest`).
- Tests print nothing new (`test-runtime/test-console-output`): no `System.out`/`System.err`, and
  no new `WARN` or `ERROR` log line from the code under test. Fix the cause the line names.
- Tests get the same PMD, Checkstyle, Error Prone and formatter checks as main code, plus the file
  (500 lines) and folder (6 files) limits. SpotBugs, the method limits, CRAP and duplicate detection
  read main sources only. In a test, use `assertThrows` instead of a try/catch. Spring rules apply
  to main sources only, as do the enum predicate, forwarding wrapper and singular-and-plural rules.
  If a PMD rule or an Error Prone check flags test code that is right, ask a human for a reviewed
  exception for `pmd/<rule>` or `errorprone/<Check>`.

## Editing existing code

- A method already over a size limit may be edited but must not get worse: the gate then prints
  a note ("allowed because base was 4"). Adding a parameter, statement or nesting level fails
  (`Legacy.total grew from 4 to 5 parameters`). Put new logic in a new method and call it once.
- A file, folder or class already over its limit must not grow: put the new code in a new class,
  and a new file in a new package.
- A line you touch must have its branches covered, even if it was uncovered before.
- Existing PMD, SpotBugs, Error Prone and Checkstyle findings stay baselined while their message is
  unchanged; adding another of the same kind in the file is new. Don't rename or move a file that
  has findings: Checkstyle and CRAP findings don't follow renames and would count as new.

## Repository files

- The gate fails committed secrets, binaries, build output and files over 1 MB; each message names
  the fix. Don't add an `exceptions` entry to get past one: stop and ask.

## Exceptions and suppressions

- `// NOPMD` does nothing, and a `@SuppressWarnings` naming `"PMD..."`, `"all"`, `"unused"`,
  `"serial"` or `"fallthrough"` is itself a finding (`pmd/InlineSuppression`). The one allowed
  marker is `@SuppressWarnings("PMD.SpringDataNativeQuery")` on a repository method with native
  SQL ([spring.md](spring.md)).
- A `@SuppressWarnings` naming an Error Prone check (`"CheckReturnValue"`, `"dep-ann"`) or NullAway
  (`"NullAway"`, `"NullAway.Init"`), `@NullUnmarked`, and a `@CanIgnoreReturnValue` the project
  declares itself are findings too (`errorprone/InlineSuppression`).
- `@SuppressFBWarnings` is a finding too (`spotbugs/InlineSuppression`). Checkstyle's
  `@SuppressWarnings("checkstyle:...")` and `CHECKSTYLE.OFF`/`CHECKSTYLE.SUPPRESS` comments do
  nothing.
- Code that is right despite a rule gets a reviewed `exceptions` entry in `nitpicker.config.json`
  that names the finding as printed, for example `pmd/UnusedPrivateField`,
  `checkstyle/AbbreviationAsWordInName` or `errorprone/FieldCanBeFinal`, with its paths and a
  reason. A structure, CRAP, changed-branch coverage, duplicate or coupling finding ends with its
  own entry. Never add one, nor a config `exclude`, `disable`, `thresholds` or legacy entry, nor a
  weaker test, to get past the gate yourself: stop and ask.
- A violated ArchUnit rule is a finding (`archunit/<rule>`) on the offending class. Run the
  `*ArchTest` class with the build's test task to read the full violation, and fix the code. In a Spring
  project nitpicker's own `archunit/spring-...` rules apply too; their message says what to change
  (see [spring.md](spring.md)).

## Kotlin projects

Under the kotlin preset the Java sources get the same checks. Kotlin sources follow the
`nitpicker-kotlin` skill; if it isn't installed, install it with
`npx skills add jhonDoe15/nitpicker --skill nitpicker-kotlin`.
