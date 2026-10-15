---
name: nitpicker-java
description: Use before writing or changing Java in a project that runs nitpicker with the java preset (or Java sources under the kotlin preset), so the code follows nitpicker's one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for Java

nitpicker gates a Gradle project (Java 21) with PMD, SpotBugs, Checkstyle, google-java-format,
JaCoCo, CRAP, PIT mutation testing, jscpd and size limits. It fails only on findings your
change adds, so leave code the task doesn't need alone. Write the allowed forms below from the
start; the gate is a backstop.

## Finish with the gate

1. Run the project's tests (`./gradlew test`). Failing tests or compile errors make the gate exit 2.
2. Format with google-java-format 1.25.2 (the project's own formatter task, or the CLI with
   `--replace`). `npx nitpicker --fix` does not touch Java.
3. Run `npx nitpicker` as a background command you wait on, without a pipe: you need its exit
   code. It runs Gradle on the merge base and on head and takes minutes. It uses the project's
   `./gradlew` when there is one, otherwise `gradle` from the PATH (`NITPICKER_GRADLE` overrides
   both).
4. Act on the exit code:
   - 0: done.
   - 1: fix every new finding (printed as `tool/rule path:line`) and any tool error listed below
     them, then rerun.
   - 2: no new findings, but a tool failed (Gradle, a compile error, a test failure). Fix the
     cause it names and rerun. Exit 2 is never a pass. If another run is in progress, wait for
     it; never kill it.
5. Never suppress: no `// NOPMD`, `@SuppressWarnings`, `@SuppressFBWarnings`, `CHECKSTYLE`
   comments, config `exclude`/`disable`/`exceptions`, legacy entries, or weakened tests. If a
   finding seems wrong, stop and ask.

With Spring on the classpath, also follow [spring.md](spring.md).

## Write it this way

- Style is google-java-format: 2-space indent, 100 columns (Checkstyle's line length).
- Text: `"a".equals(x)` or `a.equals(b)`, never `==` on strings or other objects. Pass a charset and
  a locale: `s.getBytes(StandardCharsets.UTF_8)`, `s.toUpperCase(Locale.ROOT)`.
- Output: no `System.out`/`System.err` and no `printStackTrace()`. Log with
  `System.getLogger(Foo.class.getName())`, or the project's logger.
- Null: return `List.of()`, not `null`. Never assign `null` (`out = null`); restructure instead.
- Literals: compare against named constants (`quantity >= BULK_THRESHOLD`), not literals in an
  `if`; `-1`, `0`, `1` and `2` are fine anywhere else, and any other number in main code becomes a
  `private static final` constant. A string literal used 4 times in a file becomes a constant.
  Constants are `UPPER_SNAKE_CASE` (a logger may be `log` or `logger`).
- Parameters and loops: never reassign a parameter or a catch variable; copy to a local. Use
  for-each where the index is unused. Remove unused imports, fields, locals, private methods, assignments.
- Types: declare interfaces (`List<String> out = new ArrayList<>()`, not `ArrayList<String> out`).
  Don't name a field like its method (`data` and `data()`); a `record` avoids that.
- Mutable state: don't return or store a caller's array or collection directly. Return
  `data.clone()` or `List.copyOf(items)`, and copy in the constructor.
- Data and results: `record` for data, a `sealed interface` of records for an outcome, and an
  exhaustive `switch` expression over it. A `switch` statement needs `default`.
- Resources: try-with-resources for anything `Closeable`. No `finally` that returns or throws.
- Utility classes: a `final` class of static methods with a `private` empty constructor.
- Dependencies between packages follow the project's ArchUnit rules (classes named `*ArchTest` or
  `*ArchitectureTest`); read them before importing across packages. A package must not depend on a
  less stable one (`stability-direction`), and packages or classes must not depend on each other in
  a loop (`package-cycle`, `class-cycle`): move the shared type down, or invert one side behind an
  interface.
- Optional: return it from methods and take the plain value as a field or parameter. Unwrap with
  `orElseThrow()`, `orElse`, `map` or `ifPresent`, never `get()`. Return an empty collection, not
  `Optional<List<...>>`.
- Types and casts: no raw types (`List<String>`, not `List`) and no unchecked casts; javac lints
  them, and `@SuppressWarnings` does not hide them. Replace `instanceof` plus a cast with a pattern
  (`if (shape instanceof Circle c)`) or a `switch` over a sealed type.
- Shared state: fields are `private` and `final` (a `record` for data); no `public` non-final
  field, no non-final `static` field, no `static` collection that is changed after class loading
  (build it with `List.of`, `Map.of`, `Map.copyOf`). No `@SneakyThrows`: declare the exception or
  wrap it.
- Time, threads and processes: take a `java.time.Clock` and call `now(clock)`; use `java.time`, not
  `Date`, `Calendar` or `SimpleDateFormat`. No `Thread.sleep` and no `new Thread` in main code;
  submit work to an injected executor. Restore the flag when you catch `InterruptedException`
  (`Thread.currentThread().interrupt()`) or rethrow. Run commands with `ProcessBuilder` and an
  argument list, never `Runtime.exec(String)`. No `ObjectInputStream`: read JSON.
- Streams: `map` and `collect` or `Stream.toList()`, not `Collectors.toList()`, and no `forEach` or
  `peek` that fills a collection or an array. Open `Files.lines`, `list`, `walk` and `find` in
  try-with-resources.
- Signatures and throwing: declare the checked exceptions a method throws (never `throws Exception`)
  and throw `IllegalArgumentException`, `IllegalStateException` or a project exception, never
  `RuntimeException`, `Exception` or `Error`.
- Security: SQL values go in `?` parameters of a `PreparedStatement`, never `+` or
  `String.format`. Hash with SHA-256 or better, not MD5 or SHA-1. No nested quantifiers in a regex
  such as `(a+)+`. Join a path from a parameter to a fixed base, then `normalize()` and check
  `startsWith(base)`.
- Names and declarations: abbreviations are words (`parseUrl`, `HttpClient`, `userId`, never
  `parseURL`). Declare a local next to its first use, one variable per declaration, and keep
  overloads next to each other. Mark overrides `@Override`. Never reassign a loop variable, and
  never call `System.exit`. A trailing array parameter is varargs (`String... names`).
- Javadoc is optional; when you write it, the first sentence is a real summary (not `@return`),
  every `@param`/`@return` has a description, in that order, and paragraphs start with `<p>`.
- nitpicker runs its own PMD rules (errorprone, bestpractices, performance, multithreading,
  security and the rules above), forbiddenapis, javac lint and Google checks. A project's `config/pmd/ruleset.xml` or `config/checkstyle/checkstyle.xml` counts only
  when `nitpicker.config.json` opts in under `tools`; then read it too.

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

- A method in main sources: at most 50 lines, 15 statements, control nesting 2, 3 parameters (lambda bodies count
  toward the method). Return early instead of nesting; past 3 parameters, pass a `record`.
- A file: at most 300 lines (test file 500). A folder: at most 6 source files and, separately, 6
  test files directly in it; group the rest into sub-packages.
- Cyclomatic complexity 9 or more fails `crap-score-limit` even when fully covered; less
  coverage lowers the ceiling (`ccn^2 * (1 - coverage)^3 + ccn < 9`). Split branchy methods.
- A new clone of at least 5 lines and 50 tokens in main sources (`duplicate-clone`) fails: extract
  a method. A copy with renamed variables or other literals, 100 tokens or more, fails too, in main
  and in test sources; in tests use a helper or a `@ParameterizedTest`.
- Dependencies: pin one exact version (`2.10.1`, not `2.+`, `latest.release` or `-SNAPSHOT`;
  `dependency-version-not-pinned`). A dependency no main class uses is removed, or declared
  `runtimeOnly` when it is only needed at run time (`unused-declared-dependency`).

## Tests

- Every branch you add needs a test, both outcomes of each `if`, `?:` and `catch`: each changed
  line must have at least 95% of its branches covered (`changed-branch-coverage`).
- Mutation testing runs on your change. Assert exact values and test both sides of each boundary
  (`discountCents(1000, 10)` and `(1000, 9)`); a new mutant that survives or has no test
  (`mutant-survived`, `mutant-nocoverage`) fails. If no input can kill a mutant, the code is
  redundant: delete or simplify it.
- Tests get the same PMD, Checkstyle and formatter checks as main code, plus the file (500 lines)
  and folder (6 files) limits. SpotBugs, the method limits, CRAP and duplicate detection read main
  sources only. In a test, use `assertThrows` instead of a try/catch. Spring rules apply to main
  sources only. If a PMD rule flags test code that is right, add an exception for `pmd/<rule>`.

## Editing existing code

- A method already over a size limit may be edited but must not get worse: the gate then prints
  a note ("allowed because base was 4"). Adding a parameter, statement or nesting level fails
  (`Legacy.total grew from 4 to 5 parameters`). Put new logic in a new method and call it once.
- A file or folder already over its limit must not grow: put the new code in a new class, and a
  new file in a new package.
- A line you touch must have its branches covered, even if it was uncovered before.
- Existing PMD, SpotBugs and Checkstyle findings stay baselined while their message is unchanged;
  adding another of the same kind in the file is new. Don't rename or move a file that has
  findings: Checkstyle and CRAP findings don't follow renames and would count as new.

## Exceptions and suppressions

- `// NOPMD` does nothing, and a `@SuppressWarnings` naming `"PMD..."`, `"all"`, `"unused"`,
  `"serial"` or `"fallthrough"` is itself a finding (`pmd/InlineSuppression`). The one allowed
  marker is `@SuppressWarnings("PMD.SpringDataNativeQuery")` on a repository method with native
  SQL ([spring.md](spring.md)).
- `@SuppressFBWarnings` is a finding too (`spotbugs/InlineSuppression`). Checkstyle's
  `@SuppressWarnings("checkstyle:...")` and `CHECKSTYLE.OFF`/`CHECKSTYLE.SUPPRESS` comments do
  nothing.
- Code that is right despite a rule gets a reviewed `exceptions` entry in `nitpicker.config.json`
  that names the finding as printed, for example `pmd/UnusedPrivateField`, with its paths and a
  reason. Never add one, nor a config `exclude`, `disable`, `thresholds` or legacy entry, nor a
  weaker test, to get past the gate yourself: stop and ask.
- A violated ArchUnit rule is a finding (`archunit/<rule>`) on the offending class. Run the
  `*ArchTest` class with Gradle to read the full violation, and fix the code.

## Kotlin projects

Under the kotlin preset the Java sources get the same checks. Kotlin sources follow the
`nitpicker-kotlin` skill; if it isn't installed, install it with
`npx skills add jhonDoe15/nitpicker --skill nitpicker-kotlin`.
