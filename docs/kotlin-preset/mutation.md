# Mutation

Part of the [Kotlin preset guide](../kotlin-preset.md).

**Decision: PIT's mutants of Kotlin classes are gated like those of Java classes (`mutant-survived`
and `mutant-nocoverage` are enforceable), after a filter that leaves out the mutants of code the
Kotlin compiler wrote.** What the filter keeps on the committed fixture is test gaps and a few
equivalent mutants: boundary values no test pins, a removed `close()`. The measurement is below.
The Arcmutate Kotlin plugin, which exists for this problem, is a paid product and is not used.

**Why this replaces the report-only decision.** An earlier version of this section kept the
Kotlin mutants report-only, because a list of rules tuned to one fixture "would fail agents on
mutants it has not seen and cannot be satisfied". Two things changed. First, a finding the filter
misses can now be satisfied: `mutant-survived` and `mutant-nocoverage` take a function-scoped
`exceptions` entry like every enforceable mutant finding, and the message prints it (see
`shared/exceptions/routes.mjs`), so the cost of a missed kind of junk is one reviewed entry for one
function, not a gate that cannot pass. Second, the kinds are not read off one fixture: each rule
names a construct the compiler writes (a coroutine state machine, an intrinsic, an inline body
copy, a data class member), the facts are read from the sources, and every rule has a test with
the junk it drops and the look-alike it keeps. Adversarial runs of PIT on other Kotlin code
(coroutines, value classes, `internal` members, overloads) found kinds that were dropped wrongly
and kinds that leaked; the rules above include what they found. The filter is still a list, and a
project that meets a kind it does not know takes the exception route and reports it.

**What runs.** The Java preset's `nitpickerPit` (PIT 1.17.4 with the test plugins the project's
framework needs, `pitest-junit5-plugin` 1.2.1 for Kotest and JUnit 5, the Java preset's mutator
list, the project's own tests) mutates `sourceSets.main.output.classesDirs`, which holds the Kotlin
classes next to the Java ones; the other class tools keep to `compileJava`'s output. PIT's
minions get the JVM arguments the tests run with, on Gradle and Maven alike: on Gradle the test
task's `jvmArgs`, `systemProperties`, `minHeapSize`, `maxHeapSize` and `jvmArgumentProviders` (not
the JaCoCo agent), on Maven maven-surefire-plugin's `argLine` (its configuration, else the
`argLine` property) followed by its `<systemProperties>` and `<systemPropertyVariables>` as `-D`
arguments. They reach PIT through a Java argument file, so spaces, quotes and commas survive;
[Slice 7: mutation with PIT](../java-preset/slice-7-mutation-with-pit.md) lists the exact rules and
what is left out. The ingester finds a class's source file under both kinds of source root from
PIT's `sourceFile` (also when the directory does not match the package, as for coverage). PIT's
built-in `FKOTLIN` filter (on by default) removes only mutants at line 0 of a `.kt` file, which is
not enough. In a comparison, head starts from the PIT results of the base run, as for Java (see
[Mutation in a comparison](../java-preset/mutation-in-a-comparison.md)).

**The filter.** The `kotlin-psi` program that already writes `kotlin-metrics.json` and
`kotlin-facts.json` (one parse of the sources, see [Structure limits](structure-limits.md)) writes a
third report, `kotlin-mutation-facts.json`, beside the facts report, from the same parse of the
main sources (`languages/java/gradle/kotlin-psi/mutation/`; the test roots are left out, PIT does
not mutate them). The facts do not depend on PIT's result, so there is no task of their own and
no second parse. Per file: its classes (kind, header lines, whether it has an `init` block, and the
class of the top-level declarations, which is the part class of a `@JvmMultifileClass` file), each
property with the lines of its declaration and whether an accessor is written, the written
functions (`suspend`, `inline`, whether they return `Unit`, the project's inline functions they
call, and the class whose static method a `@JvmStatic` function also becomes), the lambdas with
the lines that hold their value (the last expression and every labeled `return@`), the callee
they are passed to, whether the call's result is discarded and whether the callee is a project
function that takes a `() -> Unit` lambda, the lines with branching syntax (`if`, `when`, loops,
`&&`, `||`, `?:`, `?.`, comparisons, `==`, `!`, `!!`, `is`, `in`, `as`, and calls of the standard
library's inline functions that branch and of the project's own inline functions; for `&&`, `||`,
`?:` and comparisons the first and the last line of the whole expression) and the first and last
line of each expression with `as`. The filter is on the ingest side and knows no build tool: it
reads PIT's `pit/mutations.xml` and `kotlin-mutation-facts.json` from the module's report
directory, wherever the build tool wrote them. The program writes the mutation facts next to the
facts path it is given, so a build tool that runs it (Gradle's `nitpickerKotlinPsi` today) gets
them with the arguments it already passes. A build tool that skips the program because a module
has no Kotlin files must write the empty report itself (the contract is in
[internals.md](../internals.md)); the ingest fails with a message naming the file when it is missing.
The ingester (`languages/java/ingest/kotlin-mutants/`) applies the rules below to every
mutant of PIT's report; a mutant a rule names is left out of the findings and counted in a
descriptive `mutation-summary` finding `GeneratedCode`. Mutants in generated source files (KSP and
KAPT output under `build/generated/`, files with a generator header) need no rule here: every
finding on a generated source is dropped for both languages (see
[Generated sources](../java-preset/generated-sources.md)). The Java preset does not run any of it:
see [Java mutants of generated code](#java-mutants-of-generated-code). A rule drops one named
kind of mutant and nothing else; each has tests with the junk it drops and the look-alike it
keeps (`generated-filter.test.mjs`, `generated-filter-gaps.test.mjs` and
`generated-filter-precision.test.mjs`). The rules that need no source facts apply to mutants of
`.kt` files and of classes whose file was not found, never to a `.java` file of the same module.

| Rule                          | Drops                                                                                                                                                                                                                                                               | Keeps                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `coroutine-throw-on-failure`  | the removal of `ResultKt.throwOnFailure` in a suspend function or `invokeSuspend`, which every suspension point calls                                                                                                                                               | the removal of any other call, and `throwOnFailure` in a method that is not a suspend function (`Result.getOrThrow`)                                   |
| `null-check-intrinsic`        | the removal of a call of `Intrinsics.*` (parameter, `checkNotNullExpressionValue`)                                                                                                                                                                                  | the removal of `Intrinsics.checkNotNull` on the first or last line of an expression with `as`, which a test can kill                                   |
| `unit-result`                 | a return-value mutant of a method whose descriptor ends in `)Lkotlin/Unit;` (lambdas, callbacks, `withContext` and `coroutineScope` blocks that return `Unit`)                                                                                                      | a return-value mutant of a method that returns a value                                                                                                 |
| `default-impls-twin`          | a mutant in `Interface$DefaultImpls.m`, the compatibility copy no code calls, when the interface itself has a mutant for `m`                                                                                                                                        | a `DefaultImpls` method with no twin in the interface, and the interface method itself                                                                 |
| `inline-marker`               | the removal of `InlineMarker.mark`, which the compiler puts around suspension points of an inline function                                                                                                                                                          | the removal of `SpreadBuilder.add`/`addSpread` (a `*vararg` argument)                                                                                  |
| `when-mappings`               | any mutant in a `$WhenMappings` class the project did not declare                                                                                                                                                                                                   | a class the project itself called `...$WhenMappings`                                                                                                   |
| `synthetic-accessor`          | any mutant in a method named `access$...`                                                                                                                                                                                                                           | a method named like it, such as `accessLevel`                                                                                                          |
| `serializer-class`            | any mutant in a `$$serializer` class (kotlinx.serialization)                                                                                                                                                                                                        | the `@Serializable` class itself                                                                                                                       |
| `compose-generated`           | any mutant in a `ComposableSingletons$` class and the removal of calls of Compose's `Composer`, `ComposerKt`, `ScopeUpdateScope` and `RecomposeScope`                                                                                                               | the removal of a call of a composable the project or the runtime offers (`SideEffect`)                                                                 |
| `state-machine-branch`        | a conditional mutant (negate, boundary, removed conditional) or a switch mutant (removed case, swapped default) in a suspend function or `invokeSuspend` on a line without branching syntax: the state machine's `label` test and `switch`                          | a conditional mutant on a line of an `if`, `when`, comparison, or the operand lines of a multi-line `&&`, `\|\|`, `?:`                                 |
| `coroutine-state-field`       | the removed assignment of a state-machine field in a suspend function or `invokeSuspend`: a spilled variable (`L$0`, `I$0`) or `label`, which only a test that really suspends at that point reads back, as for `coroutine-throw-on-failure`                        | a field the developer wrote, a `label` property of the class itself (in a suspend function), any field set outside a coroutine                         |
| `suspend-lambda-result`       | a return-value mutant of `invokeSuspend` when the lambda's value is not on that line, or its result is discarded, or it is passed to a `() -> Unit` builder (a project function of that name decides by its own parameter)                                          | the value of the lambda of `async` or `withContext` that a test can read, an early `return@async`, also in a nested lambda                             |
| `suspend-unit-result`         | a return-value mutant of a written `suspend` function that returns `Unit`, on its lines (the name is the Kotlin name or the `@JvmName`, without value-class hash or `internal` suffix)                                                                              | the return value of a suspend function that returns a value, also an overload of the same name                                                         |
| `jvm-static-bridge`           | the static method that `@JvmStatic` in a companion object adds to the outer class, on the lines of the function: Kotlin callers go through `Companion`                                                                                                              | the companion's own method and any other method of the outer class, also an overload of the same name                                                  |
| `generated-accessor`          | a getter or setter of a property (constructor `val`, delegated, `isX` of a Boolean) whose accessor the developer did not write, on the lines of the property                                                                                                        | a getter written as `get() = ...`, the `setValue` call of a delegated `var`, and a method of that name on other lines                                  |
| `generated-member`            | a method of a class that the developer did not write (`copy`, `componentN`, `equals`, `hashCode`, `toString`, `values`, interface bridges, `write$Self`), on the class header lines                                                                                 | the constructor, which holds default values; any written function                                                                                      |
| `value-class-member`          | `box-impl`, `unbox-impl`, `equals-impl`, `hashCode-impl`, `toString-impl` and `constructor-impl` of a `value class` (the last only without `init` and without a secondary constructor body)                                                                         | a function the developer wrote (`doubled-1a2b3c4`), the check in an `init` block                                                                       |
| `inline-function-body`        | the out-of-line copy of an `inline fun` (also `$default` and `$$forInline`), also its lines inlined from other files, which tests only run inlined                                                                                                                  | the same lines when they are in another class or in an ordinary function, and the inlined copy in a caller                                             |
| `inlined-beyond-file`         | a mutant whose line lies past the end of its source file in a class that calls no function of the project that is `inline`: code of the standard library mapped into the caller                                                                                     | the last line of a file; the copy of a project inline function inlined into its caller                                                                 |
| `default-argument-stub`       | a conditional mutant (also a removed conditional) in a `$default` method (the mask test) on a line without branching syntax                                                                                                                                         | the default value itself and a default that branches                                                                                                   |
| `exhaustive-when-last-branch` | the last check of the last branch of a `when` with a subject and no `else` whose value is used (a function body, a property initializer, a returned value, an argument) forced true: the compiler proved the `when` exhaustive, so no input reaches past that check | the same check forced false, the other conditions of that branch, the other branches, a `when` statement, and a line that holds other branching syntax |

`default-argument-stub`, `synthetic-accessor`, `when-mappings`, `serializer-class`, `compose-generated` and
`unit-result` follow what the compiler and its plugins write, but none of them fired on the PIT reports
measured here (PIT does not mutate synthetic methods and does not mutate a returned `Unit`), so they are
tested with hand-written reports only.

Limits of the filter. The facts are read from the syntax, not from types, so a few kinds are decided by
name: the `() -> Unit` builders (`launch`, `forEach`, `collect`, ... a project function of the same name
decides by its own parameter), the standard library's inline functions that branch, and a project
function by its name whatever its overloads. Mutants of anonymous classes that the compiler copies from a
library inline function (`Delegates.observable { }`, `Flow.map { }`) carry the library's file name in
PIT's report and are not reported at all. The standard library's inline functions copied into a caller
(`filter`, `any`) have no line in the project and are left out, so a test that never asserts the
result of such a call is not asked to. When a lambda ends on the line where the call that returns its
value ends, the lambda's own state-machine return and the call's value share the line and the filter
judges by the innermost lambda.

Mutants of an inline function are therefore reported where a test can kill them: the inlined copy
in a caller of the project, on its line of the inline function's file or, when the function is in
another file, on a line past the end of the caller's file (which the filter keeps when the caller
calls a project inline function). A test that reaches the caller runs the copy, so it can kill that
mutant. Only the function's own out-of-line body, which a test never runs, and copies of the
standard library's inline functions (`use`, `map`), which have no source line in the project, are
left out. A conditional mutant on a line without branching syntax is dropped only in the three
places where the compiler writes such a branch (state machines, `$default` stubs, and the rules
above); in any other function it stays, since the measured projects have none that is not a real
gap.

**A mutant that cannot be killed.** What stays is test gaps: a boundary mutant of `require(x > 0)`
dies to a test that passes 0, and a removed `close()` to one that checks the resource is closed. Pin
it with such a test. Only a mutant that no input can tell apart from the original is equivalent
(the `0..n` loop guard whose body adds 0 for `n == 0`): change the code so that the mutant
disappears, or accept it with an `exceptions` entry for `mutant-survived` or `mutant-nocoverage`
(path and function, `reason` required), which the message names. Mutants that survived on the base
stay baselined, like every finding.

**Cost.** PIT runs on the base and on head, and the Kotlin classes make its run longer. The mutation
facts add a traversal of the trees the `kotlin-psi` program has parsed already (no second program
and no second parse). The filter reads PIT's report, so it saves no PIT time. It cannot move before
the run without losing precision: the rules that need no source facts could be a PIT
`MutationInterceptor`, but they cover only 28 of the 78 mutants the filter leaves out of the
fixture. PIT's `--avoidCallsTo kotlin.jvm.internal.Intrinsics` drops every mutant on a line that
calls the intrinsic, and the compiler puts a parameter check on the function's declaration line, so
the body of a one-line function with a non-null parameter goes with it: real, killable mutants.
PIT cannot be turned off for the preset: `disable` takes analyzer names, and the only analyzer of a
Gradle preset is `kotlin` (`"disable": ["mutation"]` is a config error), so it is all or nothing.

**Measurement.** PIT 1.17.4 with the Java preset's mutator list
([Mutators](../mutation-testing.md#java-and-kotlin-mutators)) through the init script, Kotlin 2.4.21,
kotlinx-coroutines 1.9.0, on `languages/java/ingest/fixtures/kotlin-measurement`: 5 Kotlin files
of about 330 lines (sealed classes and data classes, enums, `when` over each subject, nullables,
`as` casts, default arguments, inline functions, loops, `use`, delegates, a value class, coroutines
with `sequence`, `flow`, `async`) with tests for every behavior, though not for every boundary
value. The recorded PIT report (`fixtures/kotlin-measurement-pit.xml`) and the facts of the sources
(`kotlin-mutants/test-support/kotlin-measurement-facts.json`, which the end-to-end test of the
facts program reproduces) are committed, and `kotlin-measurement.test.mjs` pins every number
below. The fixture is small and written for this filter; it shows what each rule does, not how often
a rule fires in another project. The classification of what is left is by hand and not checked by
CI.

| Mutants                                      | Fixture |
| -------------------------------------------- | ------- |
| Generated                                    | 490     |
| Killed                                       | 362     |
| Timed out                                    | 26      |
| Survived or no coverage: would fail the gate | 102     |
| Left out by the filter, of those             | 83      |
| Left out by the filter, killed or timed out  | 109     |
| Left: would fail the gate                    | 19      |

So 83 of the 102 mutants that would fail the gate (81%) are generated code, by rule:
`coroutine-throw-on-failure` 25, `state-machine-branch` 20, `coroutine-state-field` 17,
`generated-accessor` 8, `suspend-lambda-result` 6, `null-check-intrinsic` 2, `inline-function-body` 2,
`exhaustive-when-last-branch` 1, `generated-member` 1, `default-impls-twin` 1. The 109 killed or
timed-out mutants the filter also leaves out are in the same code and in the copies of the standard
library's inline functions in callers; leaving them out changes the `Killed` count, never the gate.
With PIT's implicit mutators (the list before [#655](https://github.com/jhonDoe15/nitpicker/issues/655))
the same fixture had 242 mutants, 59 of them would fail the gate and the filter left 14; the list
adds the removed conditionals and switch cases of the state machine, the assignments of its fields
and the check of the last branch of an exhaustive `when`, all left out, and 5 mutants a test can kill.

What is left, by hand. **Fixture (19):** the boundary mutants of comparisons no test pins (`failing`,
`inRange`, `maybe`, `safeFetch`, the thresholds of `grade`, the `downTo` loop of `rangeSum`), the
removal of `reader.close()` in a `finally` and the removal of `closeFinally` (in `use`): each dies
to a test that passes the boundary or checks the resource is closed. The mutator list adds five of
the same kind: the conditions of `failing`, of the `0..n` loop guard of `rangeSum` and of the two
`grade` ranges forced to one outcome, and the `RED` check of `unreachable` forced true, each killed
by a test with an input on the other side. Four are equivalent mutants of
the program's own code, which a filter of generated code cannot know: the two boundary mutants of
the lambda inlined into `useInline`, the `0..n` loop guard of `rangeSum` (it differs only for
`n == 0`, where the body adds 0) and the upper bound of the `B` grade (it differs only for 90, which
the `A` branch took first). Change the code so that they disappear, or accept them with an
`exceptions` entry. The interface default `Animal$DefaultImpls.sound` is not left: Kotlin 2.4
compiles interface defaults to JVM default methods, `DefaultImpls` is a compatibility copy that no
Kotlin code calls, and `Fish().sound()` is covered through `Animal`.

To reproduce: run
`gradle -Pnitpicker.kotlin=true -I <nitpicker>/languages/java/gradle/nitpicker.init.gradle nitpickerPit nitpickerKotlinPsi`
in a project and read `build/nitpicker/pit/mutations.xml` and
`build/nitpicker/kotlin-mutation-facts.json`.

## Java mutants of generated code

The Java preset runs none of the filter. PIT already leaves out what javac generates: on a Java 21
class with a string `switch`, an enum `switch` (the synthetic `Gen$1` with the `$SwitchMap$` array),
an `assert` (`$assertionsDisabled`), a private member read from a nested class, a try-with-resources
and a Lombok `@Builder`/`@Value`, PIT reported mutants only in the written methods. The same
classes compiled for release 8 (where javac writes the nested-class accessor `access$000`) gave the
same result. So the Java preset keeps every mutant PIT reports and the summary counts nothing as
generated; the `GeneratedCode` metric exists only where a build passes a filter.
