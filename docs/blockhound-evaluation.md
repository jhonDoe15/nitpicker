# BlockHound evaluation: blocking calls in reactive tests

Status: evaluated, decision recorded. **Not integrated by nitpicker; supported as a project's own
opt-in.** BlockHound works as documented on the pinned toolchain, but it only reports blocking calls
that a test actually executes, it needs two settings in the project's own test setup that nitpicker
cannot add to a Maven build, and one of them is a JVM flag that crashes the whole test run when it is
missing.

BlockHound complements, and does not replace, the static check proposed in
[#315](https://github.com/jhonDoe15/nitpicker/issues/315): a static rule can only name APIs it
recognizes, BlockHound sees whatever the JVM runs on a thread that Reactor marks as non-blocking. A
path no test executes is not checked by either, and nothing on this page should be read as a static
guarantee.

## What was run

| Item         | Value                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------- |
| BlockHound   | 1.0.17.RELEASE (Apache-2.0; ByteBuddy is shaded inside the jar), plus `blockhound-junit-platform` |
| Reactor      | `reactor-core` and `reactor-test` 3.8.7                                                           |
| Kotlin       | Kotlin 2.4.21, `kotlinx-coroutines-core-jvm` and `kotlinx-coroutines-debug` 1.10.2                |
| Test runtime | JUnit Jupiter 5.11.4, launcher 1.11.4                                                             |
| Builds       | Gradle 8.14.3 and Maven 3.9.11 (surefire 3.5.2), one project each with the same sources           |
| Agents       | JaCoCo 0.8.12 and PIT 1.17.4 with the JUnit 5 plugin 1.2.1, the versions the presets pin          |
| JDK          | OpenJDK 21.0.12 only. Other JDKs were not available, so none is claimed                           |

BlockHound 1.0.18.RELEASE was published on the day of the evaluation and was not used. The fixture
project has a service whose `Mono` runs a blocking operation on a scheduler passed in by the test, and
34 tests that vary the operation and the scheduler.

## Results

Maven and Gradle gave the same pass and fail sets (34 tests, 18 failures, identical every time).

| Blocking operation on the thread                                                 | `Schedulers.parallel()` / `single()` / `Mono.delay` | `Schedulers.boundedElastic()` | Test thread |
| -------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------- | ----------- |
| `Thread.sleep`                                                                   | fails: `Blocking call! java.lang.Thread.sleep0`     | passes                        | passes      |
| `Object.wait`                                                                    | fails: `java.lang.Object#wait`                      | not run                       | not run     |
| `CountDownLatch.await`                                                           | fails: `jdk.internal.misc.Unsafe#park`              | not run                       | not run     |
| `FileInputStream.read`                                                           | fails: `java.io.FileInputStream#read0`              | passes                        | not run     |
| `RandomAccessFile.read`                                                          | fails: `java.io.RandomAccessFile#read0`             | not run                       | not run     |
| `Files.readString` (NIO file channel)                                            | **passes: not detected**                            | passes                        | not run     |
| the blocking branch is never executed (`if (block) Thread.sleep`, `block=false`) | passes                                              | not run                       | not run     |

- `Schedulers.newSingle("name")` also fails: Reactor's thread factory marks those threads as
  non-blocking, so BlockHound's default predicate applies to them without configuration.
- The error carries the blocking method, and its stack trace points into the project's code, so it is
  usable as a message without any further tooling.
- The `Files.readString` miss on JDK 21 shows the limit of the built-in blocking-method list. A
  project that cares adds `markAsBlocking` through its own `BlockHoundIntegration`.
- Kotlin coroutines (Maven build): with `kotlinx-coroutines-debug` on the test classpath (it ships a
  `BlockHoundIntegration`), `Thread.sleep` inside `withContext(Dispatchers.Default)` fails with the
  same error, while `Dispatchers.IO` and the test thread pass.

## Determinism, cost and shutdown

- Three repeated full runs per build tool gave the same 18 failing tests every time; ten
  `@RepeatedTest` repetitions of the failing case all failed and ten of the passing one all passed. The
  unmodified project passed 34 of 34 in all three runs.
- Cost: the test task of the 34-test suite took 3.2 to 4.6 s with BlockHound and 3.3 to 5.5 s without
  it, within the noise of a loaded host (load average 25 to 48 on 4 CPUs). Setup is two additions to the
  build plus the flag; there is no measurable start-up cost at this size.
- Shutdown: every run ended with the expected exit status, with no hung JVM. BlockHound installs once per
  test JVM from a JUnit Platform listener, and there is no teardown step to run.
- Without `-XX:+AllowRedefinitionToAddDeleteMethods` on JDK 21 the listener cannot be instantiated
  ("The instrumentation have failed.") and the forked test JVM fails before running one test
  (`Tests run: 0`, build failure). The flag prints a JVM warning that the option is deprecated since
  JDK 13 and will likely be removed, so the pairing is tied to the JDK.

## JaCoCo and PIT

- JaCoCo: the 15 tests that pass under both setups produced identical JaCoCo counters with and without
  BlockHound (33 of 36 lines covered, 19 of 19 methods, 121 of 129 instructions). The agent chain works
  when the surefire `argLine` starts with the JaCoCo property, which the Java preset already requires
  for Maven.
- PIT (Maven plugin, same pinned versions) on a passing test class: the baseline run needs a green suite,
  and BlockHound failures would make the baseline red, so the project's tests must already pass.
  PIT's minion JVMs take their arguments from PIT's own `jvmArgs`, not from the test task. With the
  BlockHound listener on the classpath and the flag in neither place, the coverage minion died
  (`Coverage generator Minion exited abnormally`) and the run failed. With `-XX:+AllowRedefinitionToAddDeleteMethods` passed to PIT, mutation ran, was
  identical across two repetitions, and killed one more mutant than without BlockHound: the negated
  condition that made `sleepOnlyWhen(false, parallel)` block was now detected as a blocking call on a
  non-blocking thread.
- The PIT Maven plugin copies the surefire `<argLine>` into its minions, so a literal `@{argLine}` there
  broke it (`could not open '{argLine}'`); the preset launches the PIT command line instead and does not
  read that configuration. The command-line launcher itself was not run with BlockHound.

## What nitpicker would have to do

BlockHound is a library on the project's test runtime classpath plus a JVM flag, so it has to be in the
project's own build for the project's tests to use it.

- Gradle: a `testRuntimeOnly 'io.projectreactor.tools:blockhound-junit-platform:<version>'` dependency and
  `jvmArgs '-XX:+AllowRedefinitionToAddDeleteMethods'` in the `test` task. The init script could add both to
  every `Test` task, but that changes the project's dependency graph and JVM for every project, whether or not
  it uses Reactor.
- Maven: the same dependency in the `pom.xml` and the flag after `@{argLine}` in the surefire
  `<argLine>`. Nitpicker runs Maven goals by fully qualified name and cannot add a test dependency from the
  command line, so there is no equivalent of the init script without editing the project's `pom.xml`.
- Opt-in by the project's tests: BlockHound applies to every test in the JVM once installed. A test that
  legitimately blocks on a Reactor non-blocking thread has to fail, be moved to `boundedElastic()`, or be
  covered by a `BlockHoundIntegration` the project owns (`allowBlockingCallsInside`). There is no per-test
  switch in the listener.
- Reporting: a detection is an ordinary failing test (`BlockingOperationError` in the JUnit XML), which
  the Java preset already reports as a failed test; nitpicker does not need its own finding for it, and a
  finding would have no stable location of its own because the call site is only known at run time.
- PIT: a project that adds BlockHound must also pass the flag to PIT's minions. The preset passes the
  test task's own `jvmArgs` and system properties (Gradle) or the surefire `<argLine>` (Maven, without `@{argLine}`) to PIT's
  `--jvmArgs`, so the flag the project already sets for its tests reaches the minions with no further
  configuration.

## Decision

- **Not integrated as a nitpicker-managed dependency or gate step.** The reasons: it reports only executed
  paths (and misses `Files.readString` on JDK 21), Maven cannot be wired from nitpicker, Gradle injection would
  change every project's test JVM, and a missing flag turns a missing option into a crashed suite.
- **Supported as a project opt-in for Reactor and coroutine projects**, with the setup above. When it is
  on, JaCoCo is unaffected, PIT needs the flag, and results are deterministic.
- The static rule remains the primary check for blocking calls in async contexts
  ([#315](https://github.com/jhonDoe15/nitpicker/issues/315)); BlockHound is the runtime evidence for the
  helper cases that rule cannot resolve, and never a substitute for it.

## Reproducing

Gradle (`build.gradle` in the fixture reads `-PblockHound=true` for the dependency and the flag):

```sh
gradle --no-daemon -PblockHound=true -PignoreFailures=true test jacocoTestReport
```

Maven (the `blockhound` profile adds the dependency and the flag to surefire and PIT):

```sh
mvn -B -Pblockhound -Dmaven.test.failure.ignore=true test
mvn -B -Pblockhound org.pitest:pitest-maven:1.17.4:mutationCoverage
```
