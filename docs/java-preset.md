# Java preset

Status: slices 1 (ticket X11), 2 (ticket J2), 3 (ticket J3), 4 (ticket J4), 5 (ticket J5), 6 (ticket J6), 7 (ticket J7) and 8 (ticket J8) implemented; later slices are planned below. The scope is a proposal
pending owner review.

The Java preset runs the same differential gate as the TypeScript preset on a Gradle or Maven
project (see [Maven builds](java-preset/maven-builds.md)): run
the tools on the merge base and on head, turn each report into findings
([`spec/findings.schema.json`](../spec/findings.schema.json)), and fail only on new enforceable
findings. The comparison is the language-neutral core (`compareFindings`, rename map from git),
which the conformance suite in [`spec/conformance`](../spec/conformance/README.md) covers. The Java
side contributes only two things: producing reports, and converting them into findings.

In a comparison, PIT mutates the lines the change wrote and the classes its changed tests use, and
the base runs PIT only for the latter; see
[Mutation in a comparison](java-preset/mutation-in-a-comparison.md).

Every rule the preset can report has an entry in the [rule reference](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/README.md): [PMD](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/java-pmd.md), [Checkstyle](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/java-checkstyle.md), [SpotBugs](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/java-spotbugs.md), [Error Prone](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/java-errorprone.md) and [nitpicker's own rules](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/java-nitpicker.md), with the allowed form and the `exceptions` entry of each. `nitpicker explain <tool/rule>` prints an entry.

The JDK, Gradle or Maven a CI job needs, and recipes for GitHub Actions, GitLab CI and Jenkins, are in
[nitpicker in CI](ci.md#toolchains-by-preset).

## Failing tests

A project whose test suite fails still gets every analyzer that does not need the tests to pass, on
Gradle and on Maven, and on the head as on the base, as the TypeScript preset does:

- **What is skipped.** Coverage, CRAP and mutation testing. The failing modules are built again
  without their test tasks, JaCoCo and PIT (Gradle, `-Pnitpicker.testsFailed=<modules>`), or their
  failures are listed and JaCoCo and PIT are left out (Maven, which ignores test failures).
- **What stays.** PMD, SpotBugs, Error Prone, Checkstyle, the formatter, the structure metrics,
  CPD, ArchUnit and the guards report as usual, and the comparison keeps their findings.
- **The failure.** One `tests-failed` tool error per failing module names the failing tests
  (`<n> tests fail in <module>; coverage, CRAP and mutation were skipped. Fix the tests and rerun:`
  followed by `Class.method: first line of the failure`). On the head it fails the run with exit 1;
  on a failing base it is a note, as described in [Usage](usage.md). The rule and the messages are
  those of the TypeScript preset.
- **Other build failures** (the code does not compile, a tool crashes) are still the
  `gradle-failure` or `maven-failure` tool error of the snapshot.

## JDK versions

The preset runs on projects of JDK 17 and newer, with Gradle or Maven on any JDK from 17 up. Some
tools need a JDK of their own, chosen apart from the one the project compiles with:

- **Error Prone, google-java-format, Checkstyle 13** need JDK 21 or newer. Each runs on the JVM
  that runs the build when it fits, otherwise on a JDK 21 or newer that Gradle's toolchain service
  finds or downloads (Gradle), or that nitpicker finds in `JAVA_HOME`, the `JAVA_HOME_<N>_X64`
  variables, `~/.m2/toolchains.xml`, SDKMAN, `/usr/lib/jvm` and `/Library/Java/JavaVirtualMachines`
  (Maven). The project keeps compiling for its own release.
- **The structure metrics** parse the sources with the javac of the JVM they run on, so that JVM
  must be at least the project's source level.
- **detekt** 1.23.8 cannot start on JDK 25 (its embedded Kotlin rejects the version). It runs on
  JDK 17 to 21: on the JVM running the build when that is 21 or older, otherwise on the
  newest JDK from 17 to 21 that Gradle's toolchain service finds, or that nitpicker finds
  installed (Maven). `--jdk-home` stays the
  project's JDK, so the project is still resolved against its own JDK API. ktlint and ktfmt run on
  any JDK from 17 up.
- **When no JDK fits,** that one tool is skipped and the run goes on: the build leaves
  `errorprone-skipped.txt`, `format-skipped.txt`, `checkstyle-skipped.txt`, `structure-skipped.txt`
  or `detekt-skipped.txt` with the reason in the report directory, and a `tool-skipped` tool error
  (`languages/java/adapters/reporting/skips/skipped-tools.mjs`) names the tool, the module and what
  to install. Without the structure metrics CRAP is skipped too. Every other analyzer still
  reports, and the comparison leaves out the findings of the skipped tool on both snapshots, so a
  JDK missing on one side does not make its findings new.

## Contents

Each topic has its own page, so two changes to different topics never edit the same file.

- [How it works](java-preset/how-it-works.md)
- [Maven builds](java-preset/maven-builds.md)
- [Slices](java-preset/slices.md)
- [Slice 4: ArchUnit](java-preset/slice-4-archunit.md)
- [Slice 7: mutation with PIT](java-preset/slice-7-mutation-with-pit.md)
- [Mutation in a comparison](java-preset/mutation-in-a-comparison.md)
- [Test frameworks](java-preset/test-frameworks.md)
- [Slice 2: CLI and reporter integration](java-preset/slice-2-cli-and-reporter-integration.md)
- [Slice 1: tools, reports and identities](java-preset/slice-1-tools-reports-and-identities.md)
- [Slice 3: Checkstyle](java-preset/slice-3-checkstyle.md)
- [Slice 5: CRAP](java-preset/slice-5-crap.md)
- [Slice 6: duplicates](java-preset/slice-6-duplicates.md)
- [Slice 8: gate on changed coverage](java-preset/slice-8-gate-on-changed-coverage.md)
- [Design rules](java-preset/design-rules.md)
- [Slow tests](java-preset/slow-tests.md)
- [Tests that never run](java-preset/tests-that-never-run.md)
- [Tests that copy a constant](java-preset/tests-that-copy-a-constant.md)
- [Console output of tests](java-preset/console-output-of-tests.md)
- [Round-trip tests](java-preset/round-trip-tests.md)
- [Error Prone and NullAway](java-preset/error-prone-and-nullaway.md)
- [Structure limits (SH5)](java-preset/structure-limits-sh5.md)
- [Class and package size limits](java-preset/class-and-package-size-limits.md)
- [Style](java-preset/style.md)
- [Coupling and stability (ticket SH6)](java-preset/coupling-and-stability-ticket-sh6.md)
- [Feature packages](java-preset/feature-packages.md)
- [Domain boundaries](java-preset/domain-boundaries.md)
- [Guards](java-preset/guards.md)
- [Generated sources](java-preset/generated-sources.md)
- [Spring rules](java-preset/spring-rules.md)
- [Spring architecture rules](java-preset/spring-architecture-rules.md)
- [Spring configuration files](java-preset/spring-configuration-files.md)
- [Review rules](java-preset/review-rules.md)
- [Doc comments](java-preset/doc-comments.md)
- [Reuse rules](java-preset/reuse-rules.md)
- [Rule messages](java-preset/rule-messages.md)
- [Slice 1: what is deliberately not included](java-preset/slice-1-what-is-deliberately-not-included.md)
- [Tools evaluated and not integrated](java-preset/tools-evaluated-and-not-integrated.md)
- [Tests](java-preset/tests.md)
- [Troubleshooting](java-preset/troubleshooting.md)
