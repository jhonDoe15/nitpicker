# Mutation in a comparison

Part of the [Java preset guide](../java-preset.md). Issue
[#656](https://github.com/jhonDoe15/nitpicker/issues/656) records the options.

**Decision: a comparison mutates what the change wrote and what its changed tests use, as the
TypeScript preset does.** Before, both sides mutated every class, which on a Spring Boot app with a
few hundred tests ran past the time limit on each side, so a one-file change reported nothing. The
Kotlin preset gets the same, on Gradle and Maven.

- **Changed classes.** Head mutates the classes compiled from each production `.java` or `.kt` file
  with changed lines (from `git diff --unified=0 --diff-algorithm=patience --find-renames` between
  the base and head snapshots), and keeps only the mutants on those lines. A mutant on a line the
  change wrote has no counterpart on base, so each one that survives or is not covered is new. A
  file whose change only deletes lines is not mutated.
- **Changed tests.** When the change adds, edits, renames or deletes a test file (a `.java` or `.kt`
  file under a `src/<name>/` folder whose name contains `test`, such as `src/test` or
  `src/integrationTest`, under `src/it`, or under a `test` or `tests` folder), both sides mutate,
  whole, the production files that test uses: the file named like the test without its `Test`,
  `Tests`, `IT`, `ITCase` or `Spec` part, then each production class the test names, in the order it
  names them, when it is in the test's package or imported (single, wildcard or static imports).
  The head version of the test is read on head, and the base version of an edited, renamed or
  deleted test on base. Their mutants are matched against base by identity as before, so a mutant
  the base tests killed and the changed tests let survive is new, and a legacy survivor stays held.
  At most ten files are mutated this way; the others are named in a descriptive
  `tested-modules-capped` finding of the `pit` tool, which never fails the run.
- **Base.** The base side runs PIT only for the files reached by changed tests, so a change that
  touches no test runs no mutation on base at all. Because that depends on the change, the base
  findings cache is keyed by the changed test files and their head contents (only when a test
  changed; otherwise the base entry is shared as before).
- Paths given to the run (`nitpicker src/orders --base main`) narrow the head side further.

**PIT history.** When both sides mutate the classes reached by changed tests, head also starts from
the PIT results of the base run (PIT's own incremental analysis). On the base side, every PIT run
also writes PIT's history file
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
`--all` runs and runs with no base snapshot use no history, and mutate every class.

**When head runs every mutant anyway.** PIT compares only the bytes of classes, so a change to what
the tests run with would keep base results it should not. Head therefore ignores the history when
any build input differs between base and head: a `pom.xml`, `.mvn/` settings (`extensions.xml`,
`maven.config`, `jvm.config`), a `*.gradle` or `*.gradle.kts` script, `gradle.properties`, a
`*.versions.toml` catalog, a wrapper's properties, or any file under a `resources` directory (an
`application.yml`, test data). These cover dependency versions, test JVM arguments and tags, and the
configuration a Spring context reads. Build output directories (`build`, `target`) are not
compared.

**What this gives up.** Mutants on lines the change did not write are not reported for a changed
class, and classes the change did not touch are not mutated unless a changed test uses them. So a
change that makes the tests stop killing a mutant elsewhere (an edit to a collaborator, a fixture
builder, a bean the Spring context wires in, a dependency or a config) goes unseen; so does a
changed test that reaches a production class only through other classes, or that names it in a way
the import rules above miss (a fully qualified name, a Kotlin top-level function). The TypeScript
preset has the same gap (see [Scope in a comparison](../mutation-testing.md#scope-in-a-comparison)).
`--all` (for example on a schedule) still mutates every class.

**When the base findings come from the cache.** The base side then does not run and writes no
history, so head runs every mutant of the classes it mutates.

**Measured.** With the history, builds of two modules with ten classes each (580 mutants on Java,
4 CPUs), with one class and its test changed, gave identical mutant statuses and findings with and
without the history, and head's `nitpickerPit` on Gradle took 3.8 s instead of 15.7 s. Scoping to
the change removes most of the base run as well: the prototype on
[#656](https://github.com/jhonDoe15/nitpicker/issues/656), which mutated only the changed class on
head and nothing on base, took 3.7 s in all instead of 28 s (14 s per side).
