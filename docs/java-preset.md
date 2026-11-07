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

Every rule the preset can report has an entry in the [rule reference](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/README.md): [PMD](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/java-pmd.md), [Checkstyle](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/java-checkstyle.md), [SpotBugs](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/java-spotbugs.md), [Error Prone](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/java-errorprone.md) and [nitpicker's own rules](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/java-nitpicker.md), with the allowed form and the `exceptions` entry of each. `nitpicker explain <tool/rule>` prints an entry.

The JDK, Gradle or Maven a CI job needs, and recipes for GitHub Actions, GitLab CI and Jenkins, are in
[nitpicker in CI](ci.md#toolchains-by-preset).

## Contents

Each topic has its own page, so two changes to different topics never edit the same file.

- [How it works](java-preset/how-it-works.md)
- [Maven builds](java-preset/maven-builds.md)
- [Slices](java-preset/slices.md)
- [Slice 4: ArchUnit](java-preset/slice-4-archunit.md)
- [Slice 7: mutation with PIT](java-preset/slice-7-mutation-with-pit.md)
- [Test frameworks](java-preset/test-frameworks.md)
- [Slice 2: CLI and reporter integration](java-preset/slice-2-cli-and-reporter-integration.md)
- [Slice 1: tools, reports and identities](java-preset/slice-1-tools-reports-and-identities.md)
- [Slice 3: Checkstyle](java-preset/slice-3-checkstyle.md)
- [Slice 5: CRAP](java-preset/slice-5-crap.md)
- [Slice 6: duplicates](java-preset/slice-6-duplicates.md)
- [Slice 8: gate on changed coverage](java-preset/slice-8-gate-on-changed-coverage.md)
- [Slow tests](java-preset/slow-tests.md)
- [Tests that never run](java-preset/tests-that-never-run.md)
- [Console output of tests](java-preset/console-output-of-tests.md)
- [Error Prone and NullAway](java-preset/error-prone-and-nullaway.md)
- [Structure limits (SH5)](java-preset/structure-limits-sh5.md)
- [Class and package size limits](java-preset/class-and-package-size-limits.md)
- [Style](java-preset/style.md)
- [Coupling and stability (ticket SH6)](java-preset/coupling-and-stability-ticket-sh6.md)
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
