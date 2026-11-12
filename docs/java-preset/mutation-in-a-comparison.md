# Mutation in a comparison

Part of the [Java preset guide](../java-preset.md). Issue
[#656](https://github.com/jhonDoe15/nitpicker/issues/656) records the options.

**Decision: in a comparison, head starts from the PIT results of the base run (PIT's own
incremental analysis), and the base side still mutates every class.** Head still reports every
mutant of every class with a status, so the legacy matching against base works as before; only the
mutants PIT can tell are unaffected by the change keep their base status instead of running again
(the one case where that status can be wrong is under "What this gives up"). The Kotlin preset
gets the same, on Gradle and Maven.

**How it works.** On the base side, every PIT run also writes PIT's history file
(`--historyOutputLocation`) into the build directory of its module, under
`nitpicker-pit-history/` (`<test task>.history` on Gradle, `test.history` on Maven). The head side
looks for the file at the same place in the base snapshot and passes it to its own run of that
module and test task (`--historyInputLocation`). With it, PIT keeps a base result instead of
running the mutant again when:

- the mutated class, its direct superclass and its outer class compiled to the same bytes on both
  sides, and
- for a killed mutant, the test class that killed it on base is unchanged too, and covers the class
  on head; for a survived mutant, the test classes that cover the mutated class are unchanged (PIT
  compares a sum of the covering test classes' hashes); a timed-out mutant is kept as
  long as its class is unchanged.

Every other mutant runs as before: mutants of changed classes (PIT first tries the test that killed
the mutant on base), of classes whose tests changed, and every mutant with no base result, such as
those in new classes. Coverage is still measured on head, so a mutant without a kept result that
no test reaches is reported as not covered, as before. A module or test task that has no history
on base (a new module, a base whose tests failed, so PIT did not run there) runs every mutant.
`--all` runs and runs with no base snapshot use no history.

**When head runs every mutant anyway.** PIT compares only the bytes of classes, so a change to what
the tests run with would keep base results it should not. Head therefore ignores the history when
any build input differs between base and head: a `pom.xml`, `.mvn/` settings (`extensions.xml`,
`maven.config`, `jvm.config`), a `*.gradle` or `*.gradle.kts` script, `gradle.properties`, a
`*.versions.toml` catalog, a wrapper's properties, or any file under a `resources` directory (an
`application.yml`, test data). These cover dependency versions, test JVM arguments and tags, and the
configuration a Spring context reads. Build output directories (`build`, `target`) are not
compared.

**What this gives up.** PIT decides from the bytes of the mutated class and of its tests, not from
everything the tests run. When a change edits only a class that a test uses as a collaborator (a
helper, a fixture builder, a bean the Spring context wires in), and that edit makes
the test stop killing a mutant of another, unchanged class, head keeps the base `KILLED` result and
the new survivor is not reported. The other way round, an edit that makes a test start killing a
survivor of an unchanged class leaves that survivor reported as unchanged instead of resolved, and
a timed-out mutant of an unchanged class stays timed out; neither adds a new finding. The
TypeScript preset has the same gap (see
[Scope in a comparison](../mutation-testing.md#scope-in-a-comparison)): a comparison reports the
mutants of what the change wrote and of the tests it changed; `--all` mutates everything again.

**When the base findings come from the cache.** The base side then does not run, writes no history,
and head runs every mutant, as before.

**Measured.** Builds of two modules with ten classes each (580 mutants on Java, 4 CPUs), with one
class and its test changed, gave identical mutant statuses and findings with and without the
history. On Gradle, head's `nitpickerPit` took 3.8 s instead of 15.7 s (551 of the 580 mutants
came from the history). The whole head side of the analyzer, every tool included:

| Build          | Without history | With history |
| -------------- | --------------- | ------------ |
| Gradle, Java   | 38 s            | 28 s         |
| Maven, Java    | 41 s            | 29 s         |
| Gradle, Kotlin | 46 s            | 33 s         |

Recording the history costs the base run about half a second.

**Not done: scoping mutation to the change.** Mutating only the classes with changed lines on head,
and nothing on base, as the TypeScript preset does, would also cut the base run, but mutants on
unchanged lines would no longer be reported, which drops the legacy matching the Java preset relies
on. The measurement is in [#656](https://github.com/jhonDoe15/nitpicker/issues/656).
