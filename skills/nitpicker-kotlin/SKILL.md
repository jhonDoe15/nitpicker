---
name: nitpicker-kotlin
description: Use before writing or changing Kotlin in a project that runs nitpicker with the kotlin preset, so the code follows nitpicker's one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for Kotlin

Written for nitpicker 0.1.0-rc.2. If `npx nitpicker --version` prints another version, reinstall
this skill with the command `npx nitpicker init` prints.

nitpicker allows one way to write each construct. Write it that way from the start; the gate is a
backstop. It fails only on findings your change adds, so leave code the task doesn't need alone.
Java sources in the same project follow the `nitpicker-java` skill; if it isn't installed, install
it with the command `npx nitpicker init` prints, with `--skill nitpicker-java`.

## Check one file or folder

To look at one file or folder, for example before you change it, pass its path: `npx nitpicker --all
src/main/kotlin/com/example/orders` lists every finding in it, and `npx nitpicker
src/main/kotlin/com/example/orders/Order.kt` gates only your change to that file. Paths are read
from the current folder. The analysis still covers the whole project, so it takes as long as a full
run; finish with the plain run below.

## Finish with the gate

While you iterate, run `npx nitpicker --quick`: it skips the tests and the checks built on them;
read the printed skipped list for what it left out. A quick run is never a pass; finish with the
full run below.

1. Run the project's tests (`./gradlew test`, or `./mvnw test` on Maven). Failing tests stop
   coverage, CRAP and mutation from running.
2. When the change is complete, run `npx nitpicker --fix` as a background command you wait on,
   without a pipe: you need its exit code. It first rewrites the changed Kotlin and Java files with
   the formatter named at the start of the run (ktlint or ktfmt, google-java-format for Java) and
   lists them under "Fixed files:", after its fix recipes, which list each finding they fixed
   under "Fixed findings:"; re-read those files before you edit them again. When a "Fix
   notes:" line says no formatter was found, keep the layout by hand. Then it runs the project's
   build (Gradle, or Maven with `kotlin-maven-plugin`) on the merge base and on head, with the
   project's `./gradlew` or `./mvnw` when there is one, otherwise `gradle` or `mvn` from the PATH
   (`NITPICKER_GRADLE` or `NITPICKER_MAVEN` overrides both). It takes minutes and prints a progress
   line for each slow analyzer.
   To look at the fixes first, run `npx nitpicker --fix --dry-run`: it changes no file and writes
   `fix.patch` and `fixes.json` to the output folder. `--fix --rule <tool/rule>` applies only the
   fixes of the rules you name, including their `review` recipes. A recipe that makes things worse
   (its finding stays, it adds a finding or a compile error) is rolled back and named under "Fix notes";
   `--fix --verify full` checks with the whole gate. To clear one rule across the whole project, run
   `--fix --all --rule <tool/rule>`: it also lowers the rule's allowance in `nitpicker.legacy.json`.
   For a finding no recipe fixes, read its plan in `fix-plans.json` (same folder): the target lines, the context and the steps. Follow the steps; they are done when the finding named in `doneWhen` stops.
3. Act on the exit code:
   - 0: done, unless you narrowed the run with `--analyzer`: then the summary says `Ran only: ...`
     and you run the gate again without it before you finish.
   - 1: fix the failing tests the summary leads with, every new finding and any tool error listed
     below them, then rerun. A compile error is a `build/compile-error` finding at its line; fix it
     first, since the other checks wait until the code builds.
   - 2: no new findings, but a tool failed. Fix the cause it names (usually a Gradle or Maven error) and rerun. Exit 2 is never a pass. If it says another run is in progress, wait
     for that run; never kill it.
     When the message links to [troubleshooting](https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md), the fix is there.
4. Never suppress: no `@Suppress` of a detekt or ktlint rule, coverage or mutation markers
   (`@Generated`, `@ExcludeFromJacocoGeneratedReport`, `@DoNotMutate`), config `exclude`/`disable`/`exceptions`, legacy
   entries, or weakened tests. In Java files the Java rules apply: `@SuppressFBWarnings` and
   `@SuppressWarnings("PMD")` are findings, and a project's own PMD or Checkstyle config is used
   only when `nitpicker.config.json` opts in under `tools`. If a finding seems wrong, stop and ask.
   Never pass `--accept-policy-change`, set `NITPICKER_ACCEPT_POLICY_CHANGE` or add the `accept-policy-change` label: a
   `nitpicker-config/policy-loosened` finding is for a person to accept.

With Spring on the classpath, also follow [spring.md](spring.md).

If your change edits a function, class, file or package that existed before it, read
[editing-existing-code.md](editing-existing-code.md) before you edit.

Before you change code other modules use, or fix a bug, read
[beyond-the-gate.md](beyond-the-gate.md).

To learn why a rule is on and what form it allows before you write or change code, run `npx nitpicker explain <tool/rule>` with the name a finding prints, or read the [rule reference](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/README.md). `npx nitpicker rules` lists the rules of this project's preset.

## Write it this way

The allowed forms are on one page per topic. Before you write code, read the pages for the kind of code you are about to write; on your first task in a project, read them all.

- [Style, names and secrets](rules/style-and-names.md): detekt's defaults (exceptions, `require` and `check`, magic numbers, returns), names, commented-out code, repeated strings, KDoc, secrets.
- [Values, types and data](rules/values-and-types.md): scope functions, casts, null, data classes, signatures, default parameters, URIs, regexes, enums, maps, validation targets.
- [Coroutines, I/O and remote calls](rules/concurrency-and-io.md): coroutine scopes, bounded fan-out, child processes, HTTP deadlines, closing resources, work at load time.
- [Structure and dependencies](rules/structure.md): function, file and folder limits, CRAP, duplicates, aggregates.
- [Tests](rules/tests.md): lint in tests, a fixed clock and seed, branch coverage, mutation testing, fast tests, waits, skipped and retried tests, shared state, servers and containers, assertions, coroutines in tests.

## Exceptions and suppressions

- Never `@Suppress` a detekt or ktlint rule (its name, `all`, a ruleset, `detekt:...`, `ktlint:...`):
  fix the code. The compiler warnings `UNCHECKED_CAST`, `DEPRECATION` and `USELESS_CAST` are
  findings too and are not suppressed either. If a rule flags legitimate code, stop and ask: the
  project adds the `exceptions` entry the finding's message names to `nitpicker.config.json`
  (`detekt.<ruleset>.<Rule>`, paths, reason). A structure, CRAP, changed-branch coverage, duplicate
  or coupling finding ends with its own entry
  (`{ "rule": "function-lines-limit", "paths": [...], "function": "name", "reason": "..." }`);
  switching a one-way rule off in
  `detekt.yml` has no effect. Generated code belongs in `exclude`: ask the maintainer to add it.
- The `$schema` line of `nitpicker.config.json`
  (`"$schema": "https://raw.githubusercontent.com/jhonDoe15/nitpicker/main/spec/config.schema.json"`)
  lets the editor flag a misspelled key or a value the run refuses; nitpicker ignores it. Keep it
  when you edit the file.
- A project may add forbidden calls to `ForbiddenMethodCall.methods` in its `detekt.yml`; they join
  the preset's. Do not call anything the project lists there.

## Repository files

- The gate fails committed secrets, binaries, build output and files over 1 MB; each message names
  the fix. Don't add an `exceptions` entry to get past one: stop and ask.

Why each fix recipe rewrites what it does, and what it leaves alone: [SOURCES.md](SOURCES.md).
