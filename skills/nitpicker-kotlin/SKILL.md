---
name: nitpicker-kotlin
description: Use before writing or changing Kotlin in a project that runs nitpicker with the kotlin preset, so the code follows nitpicker's one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for Kotlin

nitpicker allows one way to write each construct. Write it that way from the start; the gate is a
backstop. It fails only on findings your change adds, so leave code the task doesn't need alone.
Java sources in the same project follow the `nitpicker-java` skill; if it isn't installed, install
it with `npx skills add jhonDoe15/nitpicker --skill nitpicker-java`.

## Finish with the gate

1. Run the project's tests (`./gradlew test`). Failing tests stop coverage, CRAP and mutation from
   running.
2. When the change is complete, run `npx nitpicker` as a background command you wait on, without a
   pipe: you need its exit code. It has no `--fix` for Kotlin; format with the project's ktlint or
   ktfmt. It runs Gradle on the merge base and on head, with the project's `./gradlew` when there
   is one, otherwise `gradle` from the PATH (`NITPICKER_GRADLE` overrides both). It takes minutes
   and prints a progress line for each slow analyzer.
3. Act on the exit code:
   - 0: done.
   - 1: fix every new finding and any tool error listed below them, then rerun.
   - 2: no new findings, but a tool failed. Fix the cause it names (usually a failing test or a
     Gradle error) and rerun. Exit 2 is never a pass. If it says another run is in progress, wait
     for that run; never kill it.
4. Never suppress: no `@Suppress` of a detekt or ktlint rule, config `exclude`/`disable`, legacy
   entries, or weakened tests. In Java files the Java rules apply: `@SuppressFBWarnings` and
   `@SuppressWarnings("PMD")` are findings, and a project's own PMD or Checkstyle config is used
   only when `nitpicker.config.json` opts in under `tools`. If a finding seems wrong, stop and ask.

## Write it this way

- Scope functions: `let` for null (`value?.let { ... }`) and `apply` to configure an object you just
  created. No `run`, `with` or `also`, and no `let` or `apply` where a direct call works.
- Null: no `!!`, no `as String` on a nullable. Use `value ?: return`, `?.let`, or
  `checkNotNull(value) { "why" }` when null is a bug; `x?.let { ... }`, not `if (x == null) null else ...`.
- Coroutines: no `GlobalScope`, no `runBlocking` (a call, however it is imported). Make the caller `suspend`
  (`suspend fun main()` for an entry point) and use `coroutineScope { launch { ... } }`.
- Records: a class that only holds data is a `data class` with `val`s; change a copy with `copy(...)`.
  A class with `var`s is not flagged, nor a JPA or Spring Data entity; the project adds other
  annotations to `UseDataClass`'s `excludeAnnotatedClasses` in its `detekt.yml`.
- Design for a fixed clock and a seeded random: take a `java.time.Clock` and a `kotlin.random.Random`
  as constructor parameters, and read environment variables once where `fun main` (or the
  `@SpringBootApplication` class, or the Ktor module) builds the objects, into a config class passed in.
- detekt's defaults stay on. In main sources: lines of at most 120 characters, named constants
  instead of numbers other than -1, 0, 1 and 2 (`MagicNumber`), at most 2 `return` and 2 `throw`
  per function, conditions of at most 3 `&&`/`||` parts, no wildcard imports, and no `TODO` or
  `FIXME` without an issue (`TODO(#123): ...`). Catch and throw specific exceptions, never `Exception`, `RuntimeException` or
  `Throwable`, and pass the caught exception on as the cause (`SwallowedException`). Use
  `require(...)` and `check(...)` instead of throwing `IllegalArgumentException` and
  `IllegalStateException`; a top-level `val` holding a literal is `const val`. Remove unused private
  members and parameters.
- Never `@Suppress` a detekt or ktlint rule (its name, `all`, a ruleset, `detekt:...`, `ktlint:...`):
  fix the code. The compiler warnings `UNCHECKED_CAST`, `DEPRECATION` and `USELESS_CAST` are
  findings too and are not suppressed either. If a rule flags legitimate code, stop and ask: the
  project adds the `exceptions` entry the finding's message names to `nitpicker.config.json`;
  switching a one-way rule off in
  `detekt.yml` has no effect. Generated code belongs in `exclude`: ask the maintainer to add it.
- A project may add forbidden calls to `ForbiddenMethodCall.methods` in its `detekt.yml`; they join
  the preset's. Do not call anything the project lists there.

## Size and tests

- A function stays within 50 lines, 15 statements, 2 levels of control nesting and 3 parameters;
  past 3 parameters, pass a data class. `init` blocks (`Class.<init>`) and property
  initializers that hold a block or a branch (`val x = run { ... }`, `val y = if (...) ... else ...`) count as
  functions with the same limits. An `init` block cannot return early: move the nested part into
  a function. Complex code needs tests: the CRAP score of a function must
  stay below 9.
- A new clone of at least 5 lines and 50 tokens in main sources (`duplicate-clone`) fails: extract
  a function. A package must not depend on a less stable one (`stability-direction`).
- A file stays within 300 lines (a test file 500). A package folder holds at most 6 files and 6
  test files directly: group the rest into subpackages by what they do.
- Every branch you add needs a test: changed-branch coverage runs on your change.
- Plan tests to be fast (`test-runtime/slow-test`): a test dispatcher or fake clock instead of
  waits, a test slice instead of a full context.
- A function or file already over a limit may be edited but must not get worse: put new code in a
  new function or file and call it.
