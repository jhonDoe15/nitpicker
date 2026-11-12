# Config keys

Part of the [Kotlin preset guide](../kotlin-preset.md).

`base`, `disable`, `analyzers`, `analyzerTimeoutMinutes`, `thresholds`, `exclude`, `duplicates`, `legacyInventory` and `history` (the opt-in
[change history](../usage.md#change-history) check) as for the Java preset
(legacy inventory sources are the findings' `identity`, for example
`fp:nitpicker/subject=This expression contains a magic number. ...`). `kotlin.formatter` and
`kotlin.detektConfig` are new and valid only with this preset. `exceptions` lifts any detekt rule,
the [one-way rules](one-way-rules.md), the [source checks](source-checks.md), the
[source scans](source-scans.md) (`catch-log-without-exception` and `test-without-assertion`), the
[compiler warnings](compiler-warnings.md), the `pmd/` ids, `unused-option` and the two `kotlin-source/` coroutine
rules of the [review rules](review-rules.md), the [class limits](structure-limits.md#class-limits), the file limits
`file-lines-limit` and `folder-files-limit`, `slow-test` (or `test-runtime/slow-test`),
`test-runtime/test-not-run` (a test source set no test task runs, see
[java-preset.md](../java-preset/tests-that-never-run.md)), the
[dependency and repository checks](../usage.md#dependency-and-repository-checks), `co-change` of the
[change history](../usage.md#change-history) check (with a `<module>/**` glob), stability, and the
mutants of Java and Kotlin classes per path, and the structure, CRAP and coverage rules per function. Java rule
ids are accepted for the Java sources of the project. `layout` takes only `sharedRoots` and
`featureRoots`, which `archunit/contract-infrastructure-type` and `shared-used-by-one-feature` read (see
[contract types](../java-preset/spring-architecture-rules.md#contract-types)) and `co-change` reads once `history.coChange` is on
(`featureRoots` names its feature folders); its TypeScript source-folder keys are a config error.
