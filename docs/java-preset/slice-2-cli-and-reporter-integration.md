# Slice 2: CLI and reporter integration

Part of the [Java preset guide](../java-preset.md).

- **Selection.** Explicit only: `"preset": "java"` in `nitpicker.config.json`. A Gradle or Maven
  build is never picked up silently, because a repository with both a `package.json` and a Gradle
  build would otherwise change meaning. Without the key, nitpicker runs the TypeScript preset, unless
  the project has a Java build file and no TypeScript or JavaScript sources under its source roots
  (bundled assets such as `src/main/resources/static/*.js` do not count): then it
  stops with a config error that names `"preset": "java"` (`rejectUndeclaredPreset`, best-effort, see
  [Using nitpicker](../usage.md#configuration)). The head is measured with the head's config and the
  base with its own (widened to the head's roots), and a change to `preset` is listed under "Policy
  changed in this change"; declaring `java` on a project that had no preset is not a loosening.
  The same list reads the build files for what shrinks the measured code (Gradle `sourceSets`
  `srcDirs` and `exclude`, test excludes and filters; Maven `sourceDirectory` and surefire,
  failsafe and compiler excludes), the project tool configs the project opted into
  (`config/pmd/`, `config/checkstyle/`) and hidden code that production imports; see
  [Using nitpicker](../usage.md#configuration). Changed `.java` and `.kt` files outside the build's
  source sets are named in a notice.
- **Editor support.** A Java project has no `node_modules`, so a `$schema` line in
  `nitpicker.config.json` points at the published schema:
  `"$schema": "https://raw.githubusercontent.com/jhonDoe15/nitpicker/main/spec/config.schema.json"`. The editor then completes the keys this preset takes (`tools.pmd`,
  `tools.checkstyle`, the `java.*` conventions, the printed `<tool>/<rule>` ids) and flags the ones it
  refuses (`react`, `i18n`, `python`, `thresholds.lineLength`). nitpicker ignores the line; see
  [Editor support](usage.md#editor-support).
- **One analyzer, several tools.** The preset is a single analyzer, `java` (one Gradle run per
  snapshot), whose findings carry the tool names `pmd`, `spotbugs`, `errorprone` (Error Prone and NullAway, below), `google-java-format`, `jacoco`,
  `checkstyle` (slice 3), `archunit` (slice 4), `crap` (slice 5), `duplicates` (slice 6), `pit` (slice 7) and `spring` (configuration files, below). The analyzer declares them as
  `reportedTools` (a finding for a tool that is neither the analyzer nor a declared one is an error).
  Its version is the pinned tool versions from the init script plus the `java -version` output of
  the JDK on `JAVA_HOME` (else the `PATH`), and its configuration hash covers the init script and
  the Java adapter files, so a tool bump or a JDK switch invalidates the base cache.
- **Everything else is shared.** `nitpicker`, `--all`, `--base`, `--output`, `--defer-exit`,
  `cache publish` and `nitpicker aggregate` take the same path as for TypeScript, so the exit codes
  (0 pass, 1 new enforceable findings, 2 tool error), the console summary and the report files
  (`new-findings.json`, `summary.json`, `report.sarif`, `report.junit.xml` and the rest; `--all`
  writes `findings.json`) are the ones described under [Reports](../usage.md#reports).
- **Gradle failure.** `languages/java/adapters/java-runner.mjs` catches any failure of the preset on a
  snapshot and returns one finding, `java/gradle-failure` (`java/maven-failure` on a Maven build) with
  classification `tool-error`, whose message is the build's diagnostic output. The comparison turns it into a tool error for that
  snapshot (`base` or `head`), skips the comparison for the analyzer and exits with 2; nothing
  throws and no partial result is compared.
- **Gradle binary.** The command in `NITPICKER_GRADLE` when it is set; otherwise the analyzed
  project's own wrapper (`gradlew`, or `gradlew.bat` on Windows) when the project root has
  one (a `gradlew` without the executable bit runs as `sh gradlew`); otherwise `gradle` from the PATH
  (through the shell on Windows, where it is `gradle.bat`). The wrapper is looked up in each snapshot's
  project root (base and head are separate worktrees), so each side runs the Gradle version it pins.
  The wrapper downloads the Gradle distribution named in the head snapshot's
  `gradle-wrapper.properties`, and base and head each use their own wrapper.
- **Gradle timeout.** Each Gradle command has a 15-minute budget by default, for both Java
  and Kotlin. Set `NITPICKER_GRADLE_TIMEOUT_MINUTES` to a positive whole number of minutes,
  for example `NITPICKER_GRADLE_TIMEOUT_MINUTES=45 npx nitpicker --base main` for a slow PIT
  suite. The same budget applies to base and head. Empty values, fractions, units such as
  `45m`, and values outside 1–17895 are errors. The upper bound keeps the analyzer's Node.js
  timer within its supported range. The analyzer deadline allows two commands (the optional
  Checkstyle configuration export and the analysis), plus one minute for reports. This does
  not change Maven's command budget or configure individual PIT phases. When the analysis
  command times out outside `--quick`, it runs once more with every test task, JaCoCo and PIT
  off (`-Pnitpicker.testsSkipped=true`, which marks every project like a failing one of a red
  base), so the static findings are kept next to one `tests-timed-out` tool error.
- **Maven timeout.** Each Maven command, and each tool nitpicker runs on the Maven build's
  output, has a 15-minute budget by default. Set `NITPICKER_MAVEN_TIMEOUT_MINUTES` the same way
  as the Gradle variable, with the same limits. The analyzer deadline allows two commands plus
  one minute; when both variables are set, the larger budget sets it. When the build and test
  command times out outside `--quick`, it runs once more with the goals of a quick run (only
  the ArchUnit classes), every module skips JaCoCo and PIT, and the other tools run as usual
  next to one `tests-timed-out` tool error, as on Gradle.
- **Analyzer deadline.** `"analyzerTimeoutMinutes": { "java": 90 }` (or `"kotlin"`) in
  `nitpicker.config.json` replaces the analyzer deadline, and Gradle and Maven commands without
  their own variable get the same budget. See [Analyzer timeouts](usage.md#analyzer-timeouts).
- **Config keys.** `base`, `disable` and `analyzers` work as before. `history` turns on the
  opt-in [change history](../usage.md#change-history) check, which reads git and not the Java runner.
  `thresholds`, `exclude` and `legacyInventory` are shared with the TypeScript preset (`shared/config.mjs`,
  `head-policy.mjs`, `legacy-inventory.mjs`) and reach the Java runner as arguments, so they are
  part of the analyzer's configuration hash:
  - `thresholds.crapLimit` replaces the default CRAP limit (from `shared/policy.mjs`), and
    `fileLines`, `testFileLines` and `folderFiles` the file limits, which count the `.java` files of
    the main and test source sets (branch coverage and duplicates have fixed limits). `classMethods`
    (20), `classFields` (10), `inheritanceDepth` (3) and `folderDepth` (4) replace the limits
    described under [Class and package size limits](class-and-package-size-limits.md). Line length
    is 100 characters, where google-java-format wraps (120 for palantir-java-format, or the
    `java.lineLength` convention; see [Style](style.md)); nitpicker's own `line-length-limit` rule
    checks it (string literal text, text blocks, imports and URLs do not count, an old long line is
    held and fails only when it grows) and takes an `exceptions` entry; `thresholds.lineLength` is a
    config error, not the general 120. `unitTestSeconds` and
    `integrationTestSeconds` are the [slow test](slow-tests.md) budgets.
  - `exclude` drops findings whose project-relative path matches a glob (`**`, `*`, `?`, `{a,b}`);
    the tools still run on those files.
  - `legacyInventory` (default `nitpicker.legacy.json`) lists existing sites as
    `{ "file", "rule", "source", "count" }`, where `source` is the finding's `identity`. Up to
    `count` enforceable findings per site are baselined on both snapshots, read from the head's
    inventory. Head fails with `baseline-expansion` for any site whose count is higher than on base
    (a new site counts as 0 before).
  - `exceptions` lifts one rule for some paths: `{ "rule", "paths", "function"?, "reason" }`. `rule` is
    a finding as it is printed, `<tool>/<rule>` (for example `pmd/UnusedPrivateField`), where `tool`
    is one of the tools the Java analyzer reports, or a rule nitpicker adds, bare or as printed:
    `file-lines-limit`, `line-length-limit` (100 characters per Java line), `folder-files-limit`,
    `folder-depth-limit`, `class-methods-limit`, `class-fields-limit`, `inheritance-depth-limit`, the structure rules (`function-lines-limit`,
    `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`),
    `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`, `mutant-survived`,
    `mutant-nocoverage` and `stability-direction`, the reuse rules `duplicate-definition`,
    `sibling-copy-edit` and `exported-name-collision` (see "Reuse rules"), and the
    [dependency and repository checks](../usage.md#dependency-and-repository-checks). `function` names one method
    (`Big.run`, parameter lists ignored; matched exactly, so `run` alone does not accept
    `Big.run`) for the structure, CRAP, coverage and mutation rules, and is required for
    `changed-branch-coverage`. A branch is attributed to the narrowest method of `structure.json`
    that holds its line, or to a unit that is not a method: a `static { }` block
    (`Big.<clinit>`), an instance initializer block (`Big.<init>`) and a field initializer, lambdas
    included (`Big.field`), found by a scan of the source, so every branch of Java code can be
    named. The name in the entry is the one the finding prints. `stability-direction` takes the
    package name as printed (`"paths": ["stable"]`), not a source path. Matching findings are dropped on both snapshots. The entries reach the runner as
    `--exception <json>`, one per entry, are listed in the report and change the analyzer's
    configuration hash. Every message of a rule nitpicker adds ends with the entry that accepts it, and so does every PMD,
    Checkstyle, SpotBugs and ArchUnit message (`pmd/<rule>`).
  - `layout` is a config error with `"preset": "java"` instead of being ignored: its source-folder
    keys are TypeScript only, and `layout.featureRoots` and `layout.sharedRoots` are accepted
    because the Java and Kotlin presets run a rule that reads them (`contract-infrastructure-type`,
    listed in `OWN_RULE_SETTINGS` of `shared/project-rules/fact-rules.mjs`) and
    `shared-used-by-one-feature`, which the registry lists Java and Kotlin for; once `history.coChange`
    is on, `featureRoots` also names the feature folders `co-change` reads. `testConsole` is accepted because the registry lists Java and
    Kotlin for `test-console-output`. `tools` takes `pmd`, `checkstyle`, `spotbugs`, `errorprone` and `pit`.
- **Packaging.** The init script moved to `languages/java/gradle/` and `languages/**` is in the npm `files`;
  the packed-contents test and the installed-package test assert that `languages/java/gradle/nitpicker.init.gradle`
  ships.
- **Tests.** `core/command/java/java-cli.test.mjs` drives the CLI with a fake `gradle` (`languages/java/adapters/fixtures/fake-gradle.mjs`),
  and with a fake `mvn` plus a fake JDK (`core/command/java/test-support/`), so it runs without Java:
  pass, new finding in text/JSON/SARIF/JUnit, build failure on head and on base, an exception entry,
  missing binary, `--all`, the same cases for both builds. The Gradle fake runs in the test process: `runFakeGradle({ args, cwd })`
  (`languages/java/adapters/test-support/fake-gradle/`) is a pure function, `fixtures/fake-gradle.mjs`
  is the program that calls it, and `spawnFakeGradle` (`languages/java/adapters/test-support/in-process-gradle.mjs`),
  passed as `spawn` through `analyzeJavaSnapshot` and `runGradle`, answers the supervisor call for the fake's
  path, so no Node process starts per Gradle call. Output past `maxBuffer` is answered as `ENOBUFS` and an
  exception of the fake as a failed run; the process-tree deadline is not modelled and stays covered by
  `gradle-process.test.mjs`, and `subprocess: true` tests run the real supervisor (the one CLI case that does
  runs on the Gradle build; the process wiring does not depend on the build). The Maven preset takes the same
  `spawn` option: `runMavenPreset` passes it to `runMaven`, `runJava` and the direct `jar`, `jdeps` and `java -version`
  calls, and `spawnFakeMaven` (`core/command/java/test-support/in-process-maven.mjs`) answers the fake `mvn`
  and the fake `java`, `jdeps` and `jar` (by program name, wherever they are found) in process, so no process
  starts for them. The real Gradle and Maven runs stay behind `NITPICKER_JAVA_E2E=1` (`npm run test:java`), unchanged.
