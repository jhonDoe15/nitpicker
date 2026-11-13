---
name: nitpicker-java
description: Use before writing or changing Java in a project that runs nitpicker with the java preset (or Java sources under the kotlin preset), so the code follows nitpicker's one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for Java

Written for nitpicker 0.1.0-rc.2. If `npx nitpicker --version` prints another version, reinstall
this skill with the command `npx nitpicker init` prints.

nitpicker gates a Gradle or Maven project (Java 21) with PMD, SpotBugs, Error Prone with NullAway,
Checkstyle, google-java-format, JaCoCo, CRAP, PIT mutation testing, jscpd and size limits. It fails
only on findings your change adds, so leave code the task doesn't need alone. Write the allowed
forms of the topic pages under "Write it this way" from the start; the gate is a backstop.

## Check one file or folder

To look at one file or folder, for example before you change it, pass its path: `npx nitpicker --all
src/main/java/com/example/orders` lists every finding in it, and `npx nitpicker
src/main/java/com/example/orders/Order.java` gates only your change to that file. Paths are read
from the current folder. The analysis still covers the whole project, so it takes as long as a full
run; finish with the plain run below.

## Finish with the gate

While you iterate, run `npx nitpicker --quick`: it skips the tests and the checks built on them;
read the printed skipped list for what it left out. A quick run is never a pass; finish with the
full run below.

1. Run the project's tests (`./gradlew test`, or `./mvnw test` on Maven). Failing tests make the
   gate exit 1, and so does a change that does not compile: each compile error is a
   `build/compile-error` finding at its line, and the other checks wait until it builds.
2. Run `npx nitpicker --fix` as a background command you wait on, without a pipe: you need its exit
   code. It first rewrites the changed Java files with the formatter the run names under
   "Following this project's conventions" (google-java-format 1.35.0, `--aosp` for the aosp style,
   or palantir-java-format) and lists them under "Fixed files:", after its fix recipes, which list
   each finding they fixed under "Fixed findings:"; re-read a file it lists before you
   edit it again. When the run says no Java formatter runs, it leaves the files alone; keep the
   layout by hand. Then it runs the build on the merge base and on head, which takes minutes, with
   the project's `./gradlew` or `./mvnw` when there is one, otherwise `gradle` or `mvn` from the
   PATH (`NITPICKER_GRADLE` or `NITPICKER_MAVEN` overrides both).
   To look at the fixes first, run `npx nitpicker --fix --dry-run`: it changes no file and writes
   `fix.patch` and `fixes.json` to the output folder. `--fix --rule <tool/rule>` applies only the
   fixes of the rules you name, including their `review` recipes. A recipe that makes things worse
   (its finding stays, it adds a finding or a compile error) is rolled back and named under "Fix notes";
   `--fix --verify full` checks with the whole gate. To clear one rule across the whole project, run
   `--fix --all --rule <tool/rule>`: it also lowers the rule's allowance in `nitpicker.legacy.json`.
3. Act on the exit code:
   - 0: done, unless you narrowed the run with `--analyzer`: then the summary says `Ran only: ...`
     and you run the gate again without it before you finish.
   - 1: fix the failing tests the summary leads with, every new finding (printed as
     `tool/rule path:line`) and any tool error listed below them, then rerun.
   - 2: no new findings, but a tool failed (the build, or a base that does not compile). Fix
     the cause it names and rerun. Exit 2 is never a pass. If another run is in progress, wait for
     it; never kill it.
     When the message links to [troubleshooting](https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md), the fix is there.
4. Never suppress: no `// NOPMD`, `@SuppressWarnings`, `@SuppressFBWarnings`, `CHECKSTYLE`
   comments, coverage or mutation markers (`@Generated`, `@ExcludeFromJacocoGeneratedReport`,
   `@DoNotMutate`), config `exclude`/`disable`/`exceptions`, legacy entries, or weakened tests. The one
   exception is `@SuppressWarnings("PMD.SpringDataNativeQuery")` on a repository method with native
   SQL ([spring.md](spring.md)). If a finding seems wrong, stop and ask. Never pass
   `--accept-policy-change`, set `NITPICKER_ACCEPT_POLICY_CHANGE` or add the `accept-policy-change`
   label: a `nitpicker-config/policy-loosened` finding is for a person to accept.

With Spring on the classpath, also follow [spring.md](spring.md).

If your change edits a method, class, file or package that existed before it, read
[editing-existing-code.md](editing-existing-code.md) before you edit.

Before you change code other modules use, or fix a bug, read
[beyond-the-gate.md](beyond-the-gate.md).

To learn why a rule is on and what form it allows before you write or change code, run `npx nitpicker explain <tool/rule>` with the name a finding prints, or read the [rule reference](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/README.md). `npx nitpicker rules` lists the rules of this project's preset.

## Write it this way

The allowed forms are on one page per topic. Before you write code, read the pages for the kind of code you are about to write; on your first task in a project, read them all.

- [Style, names and Javadoc](rules/style-and-names.md): formatting, names and declarations, literals, parameters and loops, utility classes, Javadoc, the PMD and Checkstyle configs.
- [Values, types and data](rules/values-and-types.md): strings, arrays, null, declared types, defensive copies, signatures, time, URIs, regexes, maps, records, enums, forwarding methods, `tags` or `tag`.
- [Threads, I/O and remote calls](rules/concurrency-and-io.md): locks, logging, bounded fan-out, child processes, HTTP deadlines, resources and `finally`, work at class load.
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
- The `$schema` line of `nitpicker.config.json`
  (`"$schema": "https://raw.githubusercontent.com/jhonDoe15/nitpicker/main/spec/config.schema.json"`)
  lets the editor flag a misspelled key or a value the run refuses; nitpicker ignores it. Keep it
  when you edit the file.
- A violated ArchUnit rule is a finding (`archunit/<rule>`) on the offending class. Run the
  `*ArchTest` class with the build's test task to read the full violation, and fix the code. In a Spring
  project nitpicker's own `archunit/spring-...` rules apply too; their message says what to change
  (see [spring.md](spring.md)).

## Kotlin projects

Under the kotlin preset the Java sources get the same checks. Kotlin sources follow the
`nitpicker-kotlin` skill; if it isn't installed, install it with the
command `npx nitpicker init` prints, with `--skill nitpicker-kotlin`.

Why each fix decision was made, and what --fix leaves alone: [SOURCES.md](SOURCES.md).
