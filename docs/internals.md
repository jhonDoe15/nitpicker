# Internals

Contributor notes for nitpicker's own modules. They were previously source comments; the `nitpicker/no-comments` rule now keeps source files comment-free, so the intent lives here and in identifier names. One section per module.

## `core/cli.mjs`

- `runCacheCommand`: `nitpicker cache publish`: analyze the checked-out commit and upload its findings as a base snapshot.
- Publishing succeeds only when the remote accepted the entry, so it skips the local store.
- `overallStatus` reports tool health first; the exit code puts violations first.

## `core/config.mjs`

- `loadConfig`: Reads the optional config file from a project root; zero config yields an empty config.
- `describeConfigOverrides`: One line per override, so the report and the policy hash show every weakened check.
- `applyDisable`: Drops disabled analyzers and fails for unknown names or analyzers others still depend on.
- `validateExceptions`: Each exception names one rule, the files it is lifted for and why. The reason is mandatory.

## `core/custom-analyzer.mjs`

Wraps a `{name, command, args?}` config entry as an analyzer. The executable runs with the
analyzed checkout as its working directory (so a relative command resolves inside each side),
prints findings JSON on stdout, and exits 0. Its stdout goes through the same finding parser
as the built-in analyzers; a non-zero exit or invalid JSON becomes a tool error.

- `addCustomAnalyzers`: Appends the configured custom analyzers; a name clash with another analyzer is a config error.

## `core/diff/aggregate-shards.mjs`

- New violations win over tool errors so CI can tell "violations" from "broken".

## `core/diff/analyzer-scheduler.mjs`

- `HOST_CI_OUTPUT_VARIABLES`: Analyzers run the project's own tools (vitest for tests and coverage, Stryker once per mutant). On GitHub Actions each of those would append its own test report to the user's job summary, where caught mutants read as test failures, so analyzers never see where the job summary lives.
- `reportFromAnalyzerOutput`: Turns a finished analyzer process (exit status, signal and output) into its parsed report.
- `mismatchedFinding`: An analyzer may report findings of the tools it wraps (the Java preset: pmd, spotbugs, ...).

## `core/diff/cache-stores.mjs`

A cache store keeps opaque text under a hex key. It is synchronous and never throws:
`get` returns undefined on any miss or failure, `put` returns whether the value was stored.

Where findings are cached locally: `NITPICKER_CACHE_DIR` when set, else
`node_modules/.cache/nitpicker` of the project when it has a `node_modules` folder.

Plain HTTP store: `GET`/`PUT` of `<baseUrl>/<key>.json`, with an optional auth header
(`Name: value`). It works with any object store or CDN that accepts that, including S3 buckets
behind a public prefix or a signing proxy. After the first failure (other than a clean miss) the
store stays off for the rest of the run, so an unreachable server costs one timeout.

Reads the local store first, then the remote one (copying a remote hit into the local store).
Writes go to the local store, and to the remote store only when `writeRemote` is set.

- Called by the cache once an entry from `get` passed validation.
  Builds the store the environment asks for. `NITPICKER_CACHE_URL` adds a remote store behind the
  local directory (read-only unless `writeRemote`); `NITPICKER_CACHE_AUTH_HEADER` is sent as a
  header (`Name: value`) and `NITPICKER_CACHE_TIMEOUT_MS` bounds each request. `store` is undefined
  when neither a directory nor a URL is configured.

## `core/diff/cli.mjs`

- `parseDrillDownOptions`: Shared drill-down argument parsing for the single command and its shard workers.

## `core/diff/compare.mjs`

Splits findings into new, resolved, unchanged and changed-metric. When `touchedCode` is given, an
enforceable finding of a strict rule that sits in code this change touched is new even though the
base has it: `touchedCode.isStrictRule(rule, finding)` names the strict rules and
`touchedCode.changedLines` comes from `readChangedLines`. Findings in untouched code stay
baselined.

## `core/diff/findings-cache.mjs`

One cache key per analyzer: base commit, project, analyzer, tool version, configuration hash,
the head policy (exclude, layout, exceptions, thresholds) and the legacy inventory path. The
head policy is keyed explicitly because layout and threshold changes rebuild an analyzer
without changing its file-based configuration hash.

The findings cache over a store (see `cache-stores.mjs`); `directory` is shorthand for a local
directory store. Entries carry their own key, so an entry stored under the wrong name is a miss.

- Returns the cached report, or undefined on a miss, an unreadable or a mismatched entry.
- Best effort: a cache that cannot be written never fails the comparison.
  Runs the base side through the cache. Cached analyzers are skipped unless an uncached analyzer
  depends on them; only clean reports (no tool error, no tool-error finding) are stored.

## `core/diff/fingerprint.mjs`

- `parseCycleIdentity`: Dependency-cycle findings are identified by their member modules (`cycle:a>b>c|...`), listed from the lexicographically smallest rotation and anchored at its first module. Renaming a member can change which rotation is smallest, so the renamed cycle is re-rotated before comparing.

## `core/diff/git.mjs`

Returns a commit whose tree is the checkout, including untracked files that are not ignored. The
staging happens in a copy of the index, so the user's index, branches, and files are untouched.

## `core/diff/http-cache-worker.mjs`

- Child process used by the HTTP cache store: the comparison is synchronous, so each request runs in a short-lived `node` that does the (asynchronous) fetch. Usage: <GET|PUT> <url> <timeoutMs>. The optional auth header arrives in NITPICKER_CACHE_AUTH_HEADER_VALUE, never on the command line. Exit codes: 0 success (GET prints the body), 3 not found, 1 any other failure.
- S3 answers 403 for a missing key when the caller may not list the bucket.

## `core/diff/publish-cache.mjs`

Analyzes the committed tree at HEAD (typically the new tip of `main`) as a base snapshot and
stores each clean report under the key later comparisons use when HEAD is their merge base.
The policy is HEAD's own, so a branch whose policy differs simply misses.

## `core/diff/report-model.mjs`

- `hashed`: Zero config keeps the original hash input; any override changes it.

## `core/diff/reporters.mjs`

- `renderRuleFilterSection`: Drill-down view: findings whose `tool/rule` contains any of the given substrings.
  SARIF 2.1.0 log with one result per new finding (the findings the gate is about). The finding's
  comparison key, hashed, is `partialFingerprints["nitpickerIdentity/v1"]`, so consumers can match
  the same finding across runs even when its line moves. Tool errors become unsuccessful
  tool-execution notifications.

## `core/diff/run-analyzers.mjs`

- `resolveAnalyzerMetadata`: Fills in the version and configuration hash that depend on the live project and head policy.
  `runTasks(tasks, headPolicyFile)` runs the analyzer task graph and returns the scheduler's
  `{ reports, errors, timings }`; it defaults to the analyzer-scheduler subprocess.

## `core/diff/test-http-server.mjs`

An HTTP object store on 127.0.0.1 that lives in a worker thread of this process. The cache
stores block the calling thread while a request runs, so the server cannot share that thread.
Optional `token` requires `Authorization: Bearer <token>`.

- `resetTestHttpServer`: Forgets the objects, requests and failure mode of a server from `startTestHttpServer`.

## `core/fix/run-fix.mjs`

- `fixWorkingTree`: Fixes the changed files that the head policy does not exclude, with the policy's layout.

## `core/preset-analyzers.mjs`

The analyzers of the preset the config selects. `preset` is explicit: there is no auto-detection
of a Gradle project. Injected analyzers (tests, embedding) win over the preset.

## `core/snapshot/reporters.mjs`

- `renderRuleFilterSection`: Drill-down view: findings whose `tool/rule` contains any of the given substrings.

## `core/tooling/policy-links.mjs`

Makes a package-owned policy file visible inside the analyzed tree. Without `transform` the
target is a link to the file. With one (the config file changed the layout), the target is a
copy of the file's text rewritten by `transform`; the copy is still package-owned content
derived from the head policy, never from the analyzed tree.

## `core/tooling/temporary-files.mjs`

Registers a temporary file or link that a runner writes into the analyzed project root, so
that it is removed when the process exits or is interrupted, even if the runner's own
`finally` blocks never get to run. Call this before creating the file.

- Another listener owns graceful shutdown; otherwise honour the default signal action.

## `languages/java/adapters/java-analyzer.mjs`

- The Java preset as one analyzer of the differential framework. It makes the Gradle project run through the same base/head machinery, reporters and exit codes as the TypeScript preset.
- `readPinnedVersions`: The tool versions pinned in the init script, as `pmd@7.7.0;spotbugs@4.9.3;...`.
- One Gradle run yields the findings of all the tools.

## `languages/java/adapters/java-diff.mjs`

- `runJavaPreset`: Runs the preset's Gradle task in `projectRoot`; reports land in `<projectRoot>/build/nitpicker`.
  Compares the merge base of `requestedBaseRef` with HEAD (or the working tree). `failed` is true
  when the head has new enforceable findings.

## `languages/java/adapters/java-duplicates.mjs`

- Duplicate code for the Java preset: jscpd (the package's own pinned dependency, the same tool as the TypeScript `duplicates` check) over each main source root with the `java` format. The findings are the TypeScript ones: enforceable `duplicate-clone`, descriptive `duplicate-clone-size` (lines, tokens). Identity is the file pair, a hash of the cloned text and the n-th occurrence of that pair, never a line number.
- `jscpdVersion`: The version of the jscpd that runs.
  Runs jscpd over the project's existing main source roots (from build/nitpicker/manifest.json) and
  writes `build/nitpicker/duplicates.json`: `{ runs: [{ root, report }] }`, one jscpd JSON report
  per root. Throws when jscpd fails, so the caller can report a tool error.

- `readDuplicateFindings`: Findings from `build/nitpicker/duplicates.json`; jscpd names files relative to their root.

## `languages/java/adapters/java-reports.mjs`

- `sourceFileOf`: Project-relative source file of a Java class: `fileName` (from a stack frame or violation description) in the class's package directory, else the outermost class name + `.java`.
- `spotbugsSubject`: SpotBugs names the subject (class, method, field) in the message arguments; that is what the identity needs, since the message text alone is generic.
- `prepareSarif`: Makes a PMD or SpotBugs SARIF log ingestible as-is: - artifact URIs become project-relative (PMD writes absolute file:// URIs, SpotBugs writes paths relative to a source root); - results without partialFingerprints get one from `identityKey` (rule and path are already part of the finding key), so identity follows what the finding is about, never its line; - SpotBugs reports lower-confidence results at level `note`. The Java preset decides what is reported by running the tool at its configured threshold, so every reported result is enforceable.
- outside the project: the ingester skips it

## `languages/java/ingest/archunit.mjs`

- ArchUnit rules run as JUnit tests -> findings, from the JUnit XML report. One enforceable finding per violated rule and offending class: - rule: the test case name (the `@ArchTest` field or method name); - identity: the offending class, fully qualified. Line numbers in ArchUnit's violation descriptions ("in (Foo.java:12)") and the number of violations never take part, so edits above a violation do not change it; - path: the offending class's source file, resolved by `options.resolvePath(className, fileName)`; when that fails, the test class that declares the rule. A failed test case without ArchUnit violation lines (the rule could not run, an import error) yields one `test-failure` finding for that rule, anchored at the test class.
- `parseViolations`: Violation lines of one failure message, grouped by offending class in first-seen order.
- `ownerClass`: `Method <a.B.run(int)>` -> a.B; `Constructor <a.B.<init>(int)>` -> a.B; `Class <a.B>` -> a.B.

## `languages/java/ingest/checkstyle.mjs`

- Checkstyle XML -> findings. Identity hashes rule (the check's `source`), path and message; the message names the offending token, the line number is only kept as location. Repeats of the same message in a file are numbered in report order.

## `languages/java/ingest/common.mjs`

- Shared helpers for the report ingesters (Checkstyle, lcov, JaCoCo, Go coverprofile). Identity never contains line numbers.
- `normalizeReportPath`: Git-style project-relative path, or undefined when the path escapes the project.
- `createIdentityCounter`: Makes identities unique within one report: the n-th repeat of an identity (in report order) gets a `#n` suffix. Positions never take part.
- `parseXml`: Minimal XML element-tree parser: elements and attributes only (text is ignored). Skips the prolog, DOCTYPE, comments, processing instructions and CDATA. Throws TypeError when malformed.

## `languages/java/ingest/crap.mjs`

- lizard CSV (cyclomatic complexity per function) joined with JaCoCo XML (per-method coverage) -> CRAP findings, with the same rules as the TypeScript `crap` check: crap = ccn^2 * (1 - coverage)^3 + ccn, where coverage is the lower of the method's line coverage ("statement") and branch coverage, whichever are measured; `crap-score-limit` (enforceable) when crap >= limit; `crap-coverage-unknown` (enforceable) when no JaCoCo method matches the function or it has no counters. Identity is the function's long name (class, method and parameter text from lizard) plus a `#n` suffix for repeats; the line is never part of it. A JaCoCo method belongs to a lizard function when the file is the same, the method name is the same (`<init>` is the class name) and the JaCoCo method's first line lies inside the function's line range. `options.sourceRoots` (e.g. ["src/main/java"]) maps lizard's project-relative paths back to JaCoCo's package-relative ones; `options.limit` overrides the score limit.
- `parseLizardCsv`: lizard --csv rows: nloc, ccn, tokens, params, length, "name@start-end@file", file, name, long name, start, end. No header row.
- `jacocoMethods`: package-relative file path -> [{ name, first line, LINE and BRANCH counters }]
- `coverageFor`: Effective coverage percent of a lizard function, or undefined when it cannot be determined.

## `languages/java/ingest/format-check.mjs`

- Formatter check output -> findings: one enforceable `format` finding per file the formatter would change. Input is a plain list, one file per line (google-java-format --dry-run, or any formatter's "files needing a reformat" listing). Identity is the constant `format`: the file path already is part of the comparison key, so a rename follows the file and edits never matter.

## `languages/java/ingest/gocover.mjs`

- Go coverprofile -> one descriptive `statement-coverage` metric finding per file. Blocks carry only positions (no function names), so per-block findings would need line-based identity and are deliberately not emitted. `options.modulePath` (e.g. "github.com/acme/app") is stripped from the import-path prefix to get a project-relative path.

## `languages/java/ingest/jacoco.mjs`

- JaCoCo XML -> descriptive findings per source file: a `line-coverage` metric (from the sourcefile LINE counter) and one `uncovered-method` finding per method whose lines are all missed (identity from class and method name+descriptor, never the line). `options.sourceRoot` (e.g. "src/main/java") is prepended to the package-relative path.

## `languages/java/ingest/lcov.mjs`

- lcov tracefile -> descriptive findings per source file: a `line-coverage` metric and one `uncovered-function` finding per function with zero hits (identity from the function name, never its line).

## `languages/java/ingest/pit.mjs`

- PIT (pitest) XML mutation report -> findings, following the same mutation profile as the TypeScript preset (docs/mutation-testing.md): no score gate; each new surviving or uncovered mutant fails, every other non-killed status is report-only, and per-status counts are a descriptive `mutation-summary`.
- Identity never contains a line number. A mutant is identified by what it is: the mutated class, method (name and descriptor), mutator and mutation description, plus its position among the mutants with that same key in source order (`#n`, by line and then block index). Inserting code above a mutant keeps it; adding a second identical mutation in the same method adds a new occurrence.
- `options.resolvePath(className, sourceFile)` maps a mutated class to its project-relative source file; mutants whose source cannot be found (generated code) are skipped.
- `STATUS_NAMES`: PIT status -> the status names used by the Stryker-based mutation area.

## `languages/java/ingest/sarif.mjs`

- Generic SARIF 2.1.0 ingester: converts a parsed SARIF log into Nitpicker findings (spec/findings.schema.json). Identity never contains line numbers: 1. partialFingerprints, when the result carries them (sorted, so key order is irrelevant); 2. otherwise a hash of rule, path and symbol (logical location / fully qualified name). Results that share an identity inside one file are numbered in report order (`#2`, `#3`, ...) so they stay distinguishable without using positions.
- keep the raw uri when it is not valid percent-encoding

## `languages/typescript/adapters/dependency-hooks.mjs`

Per-language dependency preparation hook for base-snapshot worktrees.

`@typedef` {object} DependencyHook
`@property` {string} language Language the hook serves.
`@property` {string[]} manifests Project-relative manifest/lock files; the first marks a project
of this language, and when any differs from the live policy root the snapshot needs its own
install instead of a link.
`@property` {string} directory Project-relative directory holding installed dependencies.
`@property` {(projectRoot: string) => {kind: 'installed', dependencyPath: string}} install
Installs dependencies into `<projectRoot>/<directory>` as a regular directory, cleaning up
and throwing on failure.

## `languages/typescript/adapters/eslint-runner.mjs`

- `VALUE_ARGUMENTS`: Guarded so other adapters (for example the snapshot ESLint runner) can import normalizeEslintResults without triggering this file's own CLI behavior.
- `commentAt`: A finding reported on a comment (no-comments, ts-ignore directives, disabled inline config) is anchored to the comment text. Comments are trivia, so the nearest syntax node is the code that follows them and editing that code would otherwise change the fingerprint.
- `findStartedNode`: The deepest node whose own text (excluding leading trivia) contains the position.

## `languages/typescript/preset/analyzer-versions.mjs`

- `ESLINT_PLUGIN_PACKAGES`: Plugins whose rule behavior changes the findings of every ESLint-based analyzer.

## `languages/typescript/preset/architecture/public-contract-usage.mjs`

Find unused callable members of exported interfaces implemented by production classes.
Declaration identity prevents unrelated same-name methods and test-only calls from
appearing as consumers. Results are stable identities for a differential debt gate.

## `languages/typescript/preset/architecture/runtime-dependency-boundaries.config.mjs`

Module roles the runtime-boundary analyzer enforces. Each role selects production modules by
`modules` globs (relative to `src/main`) and lists `forbiddenDependencies` and
`forbiddenCalls` globs. The default declares no roles; add roles for your project's
architecture.

## `languages/typescript/preset/architecture/runtime-dependency-boundaries.mjs`

- `inspectModuleBoundary`: Inspect declared runtime dependency edges and explicitly forbidden calls for one module role.
- `normalized`: Resolve relative spelling before matching; globstars do not traverse ".." segments.
- `analyzeRuntimeBoundaries`: Discover production modules by configured role patterns; return findings and coverage together.

## `languages/typescript/preset/architecture/strict-boundary-rules.mjs`

- Strict-preset boundary rules for dependency-cruiser. The default config spreads `strictBoundaryRules` into `forbidden`. Each rule's `comment` is printed with the violation and names the allowed form.

## `languages/typescript/preset/architecture/strict-layout.mjs`

- `main`: Path patterns for the layout the strict preset fixes (docs/typescript-strict-preset.md).

## `languages/typescript/preset/callback-protocols/analyze.mjs`

- `analyzeCallbackProtocols`: Analyze callback roles and their reachable local function bodies, regardless of naming.
- Uninvoked function literals are not part of the source callback's execution.
- `analyzeProductionCallbacks`: Discover all production sources. Tests/build outputs are excluded by file role, never feature.

## `languages/typescript/preset/callback-protocols/contracts.mjs`

API contracts declare roles; analyzer rules contain no consumer or file identities. Each entry
names a `callee`, its `optionsArgument` index, `sourceCallbacks`, `correlatedCallbacks`
(`{ name, inputIndex }`), `externalPublicationCallbacks`, and `snapshotReadMethods`.

## `languages/typescript/preset/coding-standards/check.mjs`

- `readLegacyInventory`: A missing inventory file means no legacy sites are allowed.

## `languages/typescript/preset/crap/report.mjs`

The CRAP analyzer expands a directory only when it is named `src` (or finds `src` folders
below it), so roots with any other name are handed over as the files inside them.

## `languages/typescript/preset/defaults/eslint.config.mjs`

- `policy`: The head policy comes from nitpicker.config.json; without it the preset defaults apply.

## `languages/typescript/preset/dependency-graph/cruise.mjs`

Links the policy TypeScript config into the analyzed project root, so its include globs
resolve against the analyzed sources, and runs `operation` with the environment that
`config.mjs` reads the linked path from.

`typeScriptRoot` is the directory whose source and test roots the policy TypeScript config
should cover; it defaults to this package root and is overridden for self-contained fixtures.

## `languages/typescript/preset/diff/configured-analyzers.mjs`

Rebuilds the preset's analyzers for the project's layout and `exclude` globs, so their
patterns, source roots and exclusions follow the config file. Analyzers that are not the
preset's own (custom or injected ones) pass through untouched.

- `applyThresholds`: Applies config thresholds by rebuilding the affected analyzers; others pass through.
- `applyLegacyInventory`: Points the coding-standards analyzer at the project's legacy inventory file.

## `languages/typescript/preset/eslint-config/error-wrapping-policy.mjs`

- `errorWrappingPolicy`: Classified wrappers that intentionally sanitize external failures retain their bounded contract by listing `classificationIndex` and `unclassifiedValue`; only unclassified wrappers must carry the original diagnostic cause.

## `languages/typescript/preset/eslint-config/exceptions.mjs`

Lifts configured rules for configured paths. Exceptions come only from nitpicker.config.json
through the head policy; the strict preset bans inline disables, so this is the one way out.

## `languages/typescript/preset/eslint-config/strict-adapters.mjs`

- `adapterGlobsFor`: The I/O folders of every feature, below each source root of the layout.
- Adapters-only selectors (throw rules); the control-flow selectors that apply to all production code live in strict-control-flow.mjs and are added here for the standalone config. Syntactic strict rules for `features/<name>/adapters/`. These work without type information. The preset enables them through strict.mjs, which merges `restrictedAdapterSyntax` with the selectors that apply everywhere (including the control-flow ones): a config that sets `no-restricted-syntax` for the same files replaces this list, so this standalone config is for tests of the adapters rules on their own. Zod is a documented expectation of the preset, not a dependency of nitpicker: the rule works on syntax and its messages name the zod schema as the allowed form.
- `strictAdaptersTypedConfig`: Type-aware strict rules for the same files. The consuming config must give the parser type information (as the default preset does with parserOptions.project).

## `languages/typescript/preset/eslint-config/strict-composition-root.mjs`

- Strict rule set for "objects are constructed only in the composition root; no module-level let". The default ESLint config enables both rules (see strict.mjs and defaults/eslint.config.mjs); this standalone config lets the failure-message harness lint them on their own.

## `languages/typescript/preset/eslint-config/strict-control-flow.mjs`

- `loopSelectors`: Control-flow selectors for all production code. `domain/` has stricter loop and forEach rules of its own, so strict.mjs leaves `loopSelectors` and `forEachSelectors` out of the domain list.
- `controlFlowRules`: `eqeqeq` reports `==` and `!=` with a message that names `===` and `!==`.

## `languages/typescript/preset/eslint-config/strict-domain.mjs`

- `domainGlobsFor`: The pure-logic folders of every feature, below each source root of the layout.
- `domainRestrictedSyntax`: Selectors for the no-restricted-syntax rule. Exported so the strict preset assembler can concatenate them with other no-restricted-syntax selectors scoped to the same files: a flat config entry for a rule replaces, rather than extends, an earlier entry for that rule.
- `domainTypeAwareFunctionalRules`: Rules that need type information (a parserOptions program). strict.mjs enables them in the preset's typed config; the standalone domain config below runs without a type program.

## `languages/typescript/preset/eslint-config/strict-tests.mjs`

- Strict rules for test code: each one bans a form that makes a suite slow or non-hermetic and names the one allowed form (see docs/typescript-strict-preset.md, "Inside tests").
- `strictTestRules`: Rules for every file of the test layout area: test files, helpers and fixtures.
- `strictTestHelperRules`: Rules for the test area's helper and fixture scripts, which are not test files themselves.
- `strictTestConfigFor`: The strict test-area entries for one layout; strictPresetConfig() includes them.
- Standalone config so the failure-message harness can lint the test rules on their own.

## `languages/typescript/preset/eslint-config/strict.mjs`

- `everywhereSelectors`: ESLint flat config replaces, not merges, a rule's options when several config objects match the same file. So every scope carries the full list for the files it covers: the selectors that apply everywhere plus the ones for that scope. Add a selector to the list of its scope here, never as a separate `no-restricted-syntax` entry for a narrower glob.
- `productionSelectors`: Control flow applies to all production code except config files. `domain/` has its own, stricter loop and forEach selectors, so it takes only the promise-chain ones to avoid a duplicate message.
- `restrictedSyntaxByScope`: The complete `no-restricted-syntax` selector list for each scope of the strict preset.
  Rules that need only the syntax tree, for one layout: they run without a TypeScript program.
  Entries later in the array win, so `domain/` and `adapters/` follow the general entries.

Rules that need type information, for one layout. `parserOptions` is how typescript-eslint finds
the program, for example `{ project: './tsconfig.quality.json', tsconfigRootDir }`.

- `strictProductionRules`: Rules for every production file that need no scope of their own.
- `strictPresetConfig`: Everything the strict preset adds to the project's own ESLint config, for one layout.

## `languages/typescript/preset/eslint-plugin/rules/no-first-test-charged-setup.mjs`

- `CHEAP_CALL_ROOTS`: Roots whose calls are cheap and deterministic: memoizing them saves nothing worth a hook.
- `storedValue`: The call, widened to `await call` when awaited, whose value an assignment would store.
- `isEmptyCheck`: `!x`, `x === undefined`, `x == null`, `x === null` (either side), for the memo `name`.
- `isPresentCheck`: `x`, `x !== undefined`, `x != null`, for the early-return form of the memo.
- `isGuardedByEmptyCheck`: True when the assignment statement only runs while `name` is still empty.
- `memoTarget`: The memo variable a call's value is lazily stored in, or undefined when it is not a memo.

## `languages/typescript/preset/eslint-plugin/rules/no-handwritten-boundary-guard.mjs`

- `isSchemaParseCall`: `schema.parse(value)` and friends: a call on a member whose method is a schema parse method.

## `languages/typescript/preset/eslint-plugin/rules/no-managed-resource-construction-outside-composition-roots.mjs`

- `DEFAULT_COMPOSITION_ROOT_PATTERN`: A file named like a factory is not a composition root: construction belongs in these files only.

## `languages/typescript/preset/eslint-plugin/rules/no-raised-test-timeout.mjs`

- `timeoutNodes`: The nodes holding a timeout in a test, suite or hook registration, or in vi.setConfig.

## `languages/typescript/preset/eslint-plugin/rules/no-uninjectable-delay.mjs`

- `MIN_UNINJECTABLE_DELAY_MS`: Delays below this are short enough that a test waiting them out is not worth a rule.
- `OPTION_PARAMETER_NAME`: A parameter with one of these names can carry the delay, as can any destructured, defaulted or rest parameter: the rule only reports functions whose parameters clearly cannot.
- `topLevelFunction`: The outermost function containing `node`, when it is a top-level declaration or const.
- `delayConstant`: The module-level constant identifier a delay expression is built from, or undefined.

## `languages/typescript/preset/eslint-plugin/rules/test-code-analysis.mjs`

- Shared syntax helpers for the rules that look at what a test does per test: which callbacks run once per test, which same-file functions they reach, and which calls start a child process. Everything here works on one file's syntax tree; calls into other modules are not followed.
- `REGISTRATION_FACTORIES`: Members that return a registration function instead of registering a test themselves.
- `findVariable`: The variable `name` refers to at `node`, found through the scope chain.
- `resolveConstant`: The initializer of the `const` an identifier refers to, followed through const aliases.
- `resolveFunction`: The same-file function an identifier names: a function declaration or a const function.
- `constantNumber`: Number value of a literal, a const, or arithmetic over those; undefined when not constant.
  Local names bound by imports or `require` destructuring of the given modules: `named` maps a
  local name to the imported name, `namespaces` holds namespace, default and whole-module names.

- `importedCalleeName`: The imported name a callee refers to (`spawnSync`, `cp.spawnSync`), or undefined.
- `commandName`: `node` for process.execPath, a package bin path, or a literal command name.
- `literalTokens`: Literal argument tokens; a non-literal array element becomes '' so positions stay aligned.
  Describes a direct child-process call: its command (`node` for process.execPath and fork,
  `package-bin` for a node_modules/.bin path, else the literal name), the literal argument tokens,
  and the nodes holding the command, the argument list and the options.

- `gitSubcommand`: The git subcommand among the tokens, skipping global options such as `-c key=value`.
  For a call to a same-file wrapper around a child-process call (`git(root, ['init'])`,
  `run('git', args)`), the wrapped call and the command and tokens the call site supplies.

The callback a per-test registration runs: `it`/`test` (with `.each`, `.only`, `.concurrent`
and the like) and, when `hooks` names them, hooks such as `beforeEach`.

Builds visitors that call `check(node)` for every call and `new` expression reached from a
per-test callback, following calls to same-file functions. `check` returns a report descriptor
or undefined; each node is reported once however many tests reach it.

## `languages/typescript/preset/eslint-plugin/rules/test-tsconfig-pins-lib-and-types.mjs`

- `knownKeys`: Keys of an object literal, following same-file const spreads; undefined if a spread is opaque.

## `languages/typescript/preset/failure-messages/cases.mjs`

- `failureMessageCases`: Add one entry per banned form. `config` is any ESLint flat config array; `banned` is a fixture that must fail; `allowed` is the wording the message must use to name the allowed form.

## `languages/typescript/preset/failure-messages/harness.mjs`

- `checkFailureMessageCase`: One case per banned form: `banned` is the fixture snippet that must fail, `allowed` is the wording (a substring, case-insensitive) the failure message must contain to name the allowed form.

## `languages/typescript/preset/layout.mjs`

Derives every layout-dependent value from the source roots, test roots and excluded globs.
`layout` holds the preset's own settings, `exclude` the project's extra globs from the config
file. The result is plain data plus predicates, so each runner resolves it once.

- Regular expression source for the config file's `exclude` globs, or undefined when empty.
- True for production sources below `root`, a directory inside one of the source roots.
- The source root that contains `file`, matched as a path segment, or undefined.

## `languages/typescript/preset/quality-checks.mjs`

- `eslintVersion`: Versions are resolved only for selected analyzers, against the binaries that will run.
  Builds every check definition for one layout. The exported constants below are the default
  layout; the CLI rebuilds the layout-dependent analyzers when the config file changes it.

## `languages/typescript/preset/strict-rules.mjs`

- Written out, not derived from `strictPresetConfig`: building that config loads typescript-eslint and
- `strictEslintRuleIds`: strict-rules.test.mjs asserts this list equals the rule ids of the real config.

## `languages/typescript/preset/tool-configs.mjs`

- `expandLayoutRoots`: Replaces `src/...` entries with one entry per source root and `test(s)/...` per test root.
- `layoutTsconfig`: `tsconfig.quality.json` and `tsconfig.stryker.json`: include the layout roots, skip `exclude`.
  Returns a function that rewrites a JSON policy file's text for the layout, or undefined when
  the layout is the default and the file can be linked unchanged.
