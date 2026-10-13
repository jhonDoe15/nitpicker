---
name: nitpicker-kotlin
description: Use before writing or changing Kotlin in a project that runs nitpicker with the kotlin preset, so the code follows nitpicker's one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for Kotlin

nitpicker allows one way to write each construct. Write it that way from the start; the gate is a
backstop. It fails only on findings your change adds, so leave code the task doesn't need alone.
Java sources in the same project follow the `nitpicker-java` skill.

## Finish with the gate

1. Run the project's tests (`./gradlew test`). Failing tests stop coverage, CRAP and mutation from
   running.
2. When the change is complete, run `npx nitpicker` as a background command you wait on, without a
   pipe: you need its exit code. It has no `--fix` for Kotlin; format with the project's ktlint or
   ktfmt. It takes minutes and prints a progress line for each slow analyzer.
3. Act on the exit code:
   - 0: done.
   - 1: fix every new finding and any tool error listed below them, then rerun.
   - 2: no new findings, but a tool failed. Fix the cause it names (usually a failing test or a
     Gradle error) and rerun. Exit 2 is never a pass. If it says another run is in progress, wait
     for that run; never kill it.
4. Never weaken tests or edit `exclude`, `disable` or legacy entries to pass. If a finding seems
   wrong, stop and ask.

## Write it this way

- Scope functions: `let` for null (`value?.let { ... }`) and `apply` to configure an object you just
  created. No `run`, `with` or `also`, and no `let` or `apply` where a direct call works.
- Null: no `!!`, no `as String` on a nullable. Use `value ?: return`, `?.let`, or
  `checkNotNull(value) { "why" }` when null is a bug; `x?.let { ... }`, not `if (x == null) null else ...`.
- Coroutines: no `GlobalScope`, no `runBlocking` (a call, however it is imported). Make the caller `suspend`
  (`suspend fun main()` for an entry point) and use `coroutineScope { launch { ... } }`.
- Records: a class that only holds data is a `data class` with `val`s; change a copy with `copy(...)`.
  A class with `var`s is not flagged. Where equality by value is wrong (a JPA `@Entity`), the project
  narrows `UseDataClass` with detekt's own `excludeAnnotatedClasses` in its `detekt.yml`.
- Never `@Suppress` a detekt or ktlint rule (its name, `all`, a ruleset, `detekt:...`, `ktlint:...`):
  fix the code. Kotlin compiler warnings (`UNCHECKED_CAST`) may be suppressed. If a one-way rule
  flags legitimate code, stop and ask: the project adds an `exceptions` entry
  (`detekt.<ruleset>.<Rule>`, paths, reason) to `nitpicker.config.json`; switching a one-way rule off in
  `detekt.yml` has no effect. Generated code goes in `exclude`.

## Size and tests

- A function stays within 50 lines, 15 statements, 2 levels of control nesting and 3 parameters;
  past 3 parameters, pass a data class. Complex code needs tests: the CRAP score of a function must
  stay below 9.
- A file stays within 300 lines (a test file 500). A package folder holds at most 6 files and 6
  test files directly: group the rest into subpackages by what they do.
- Every branch you add needs a test: changed-branch coverage runs on your change.
- A function or file already over a limit may be edited but must not get worse: put new code in a
  new function or file and call it.
