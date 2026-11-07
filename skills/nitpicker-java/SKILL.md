---
name: nitpicker-java
description: Use before writing or changing Java in a project that runs nitpicker with the java preset (or Java sources under the kotlin preset), so the code follows nitpicker's one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for Java

nitpicker gates a Gradle or Maven project (Java 21) with PMD, SpotBugs, Error Prone with NullAway,
Checkstyle, google-java-format, JaCoCo, CRAP, PIT mutation testing, jscpd and size limits. It fails
only on findings your change adds, so leave code the task doesn't need alone. Write the allowed
forms of the topic pages under "Write it this way" from the start; the gate is a backstop.

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
   - 0: done, unless you narrowed the run with `--analyzer`: then the summary says `Ran only: ...`
     and you run the gate again without it before you finish.
   - 1: fix the failing tests the summary leads with, every new finding (printed as
     `tool/rule path:line`) and any tool error listed below them, then rerun.
   - 2: no new findings, but a tool failed (the build, a compile error). Fix the
     cause it names and rerun. Exit 2 is never a pass. If another run is in progress, wait for
     it; never kill it.
5. Never suppress: no `// NOPMD`, `@SuppressWarnings`, `@SuppressFBWarnings`, `CHECKSTYLE`
   comments, coverage or mutation markers (`@Generated`, `@ExcludeFromJacocoGeneratedReport`,
   `@DoNotMutate`), config `exclude`/`disable`/`exceptions`, legacy entries, or weakened tests. The one
   exception is `@SuppressWarnings("PMD.SpringDataNativeQuery")` on a repository method with native
   SQL ([spring.md](spring.md)). If a finding seems wrong, stop and ask. Never pass
   `--accept-policy-change` or set `NITPICKER_ACCEPT_POLICY_CHANGE`: a
   `nitpicker-config/policy-loosened` finding is for a person to accept.

With Spring on the classpath, also follow [spring.md](spring.md).

If your change edits a method, class, file or package that existed before it, read
[editing-existing-code.md](editing-existing-code.md) before you edit.

Before you change code other modules use, or fix a bug, read
[beyond-the-gate.md](beyond-the-gate.md).

To learn why a rule is on and what form it allows before you write or change code, run `npx nitpicker explain <tool/rule>` with the name a finding prints, or read the [rule reference](https://github.com/jhonDoe15/nitpicker/blob/main/docs/rules/README.md). `npx nitpicker rules` lists the rules of this project's preset.

## Write it this way

The allowed forms are on one page per topic. Before you write code, read the pages for the kind of code you are about to write; on your first task in a project, read them all.

- [Style, names and Javadoc](rules/style-and-names.md): formatting, names and declarations, literals, parameters and loops, utility classes, Javadoc, the PMD and Checkstyle configs.
- [Values, types and data](rules/values-and-types.md): strings, arrays, null, declared types, defensive copies, signatures, time, URIs, regexes, maps, records, enums.
- [Threads, I/O and remote calls](rules/concurrency-and-io.md): locks, logging, bounded fan-out, child processes, HTTP deadlines, resources, work at class load.
- [Errors](rules/errors.md): catching, rethrowing and failures as values.
- [Structure and dependencies](rules/structure.md): method, file and folder limits, CRAP, duplicates, test-only code, aggregates, package dependencies.
- [Tests](rules/tests.md): branch coverage, mutation testing, fast tests, waits, retries, shared state, servers and containers, console output.

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
