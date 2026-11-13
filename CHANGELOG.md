# Changelog

All notable changes to nitpicker are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0.0, a minor release can contain breaking
changes and a patch release is fixes only.

Each release lists what was added, what changed (including rules that are stricter and can fail code
that passed before), what was fixed, and what to do when upgrading. A failure that is not a finding
about your code is explained in [troubleshooting](https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md).

## [Unreleased]

### Changed

- TypeScript and JavaScript: `nitpicker/no-null` allows `null` as an object field, array element or
  conditional branch in the data passed to `JSON.stringify`, where it is the JSON value for nothing
  (an explicit `null` field of a request body, or a key a tsconfig or merge patch must unset) (#1100).
  `null` built outside the call, or passed to another function inside it, is still reported.
- Java: Error Prone's `ForEachIterable` and `FieldCanBeStatic` are off. Every Error Prone release
  from 2.26 to 2.52 crashes on them for record patterns with `var` bindings and Lombok `@Getter`
  fields; `pmd/ForLoopCanBeForeach` and `spotbugs/SS_SHOULD_BE_STATIC` now report those loops and
  fields (SpotBugs only when the initializer is a compile-time constant).
- An added `layout.entryPoints` or `python.entryPoints` entry is listed among the policy changes
  and no longer fails the gate as a `nitpicker-config/policy-loosened` finding, so it needs no
  `accept-policy-change` approval (#1094). An entry that covers a file other production code
  imports, such as a `**` glob, still fails, as do exceptions, exclusions, disabled analyzers and
  the other loosenings.

### Fixed

- Java: Spring architecture findings no longer print their exception sentence twice, which made
  the Java analyzer fail on most Spring projects and report no Java findings (#1050).
- A finding that fails nitpicker's finding schema is left out with one tool error that names it,
  and the analyzer's other findings are kept (#1050).
- Java: an Error Prone check that crashes is turned off for the run and reported as one
  `errorprone/check-crashed` tool error; the other checks' findings are kept (#1069).

## [0.1.0-rc.2] - 2026-11-12

### Added

- Test runners: coverage, CRAP and mutation testing use the project's own runner (Vitest, Jest,
  `node:test` or Mocha), chosen from `tools.tests.runner`, the `test` script, config files or the
  dependencies (#269).
- `tools.typescript.project` selects the project's TypeScript config for the type check and the
  mutation checker (#305).
- `tools.tests.timeouts` sets test and hook deadlines per language and named project (#368).
- `NITPICKER_GRADLE_TIMEOUT_MINUTES` raises the 15 minute budget of each Gradle command (#308).
- Project conventions: nitpicker follows the project's own style, such as quotes, indentation, line
  length, trailing commas, import style and file name casing, in every preset (#261, #266, #280).
- Python: Django and nose2 runners, mutation of unittest suites, pipenv, hatch and conda
  environments, a separate environment for a base with other dependencies, basedpyright, and opt-in
  project configs for pyright, mypy, mutmut, ruff and black (#272, #273, #281, #286).
- Java and Kotlin: every Gradle `Test` task that `check` runs, every project of a multi-project
  build, and JUnit 4, TestNG, Spock and Kotest projects (#242, #279, #387, #389).
- `spring.roles` in the `java` and `kotlin` presets names the project's own controller, service and
  repository annotations or supertypes (#486).
- The base of a TypeScript or JavaScript comparison is installed with the project's own package
  manager: npm, pnpm, Yarn or Bun (#282).
- `"history": { "coChange": true }` turns on a report-only `change-history/co-change` analyzer that
  names production modules that keep changing together (#492).
- `report-baseline.sarif` holds the unchanged findings next to `report.sarif`, which keeps only the
  new ones, and `--all` writes `report.sarif` too (#517).
- Every finding that can be intended ends with the exact `exceptions` entry to add (#396).
- A base whose tests fail no longer blocks the comparison: it becomes a note, and the results that
  need passing tests are judged only in the code the change touches (#390).
- Projects whose only TypeScript is TypeScript 7 run with a bundled JavaScript API (#490).
- `tools.jscpd.precedence` lets a project's `.jscpd.json` set the duplicate detection options, in
  every preset (#379).
- `nitpicker changelog [<version>]` prints a version's entry from this changelog, which now ships in
  the package (#555).
- [Troubleshooting](https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md) explains
  each failure that is not a finding, and the messages whose fix needs more than they say link to
  their entry, for the version you run (#555).

- The Go preset (`"preset": "go"`): gofmt, go vet, tests, coverage and structure limits, duplicates,
  package coupling, dead and test-only code, `go mod tidy`, staticcheck, errcheck and other x/tools
  passes, revive, curated linters for resources, errors, context, types, values and tests, and
  nitpicker's own Go rules for errors, concurrency, package state, HTTP timeouts and I/O in loops
  (#499, #957, #972, #994, #995, #997, #998, #999, #1001, #1002, #1004, #1018, #1023).
- Kotlin on Maven, and Kotlin Multiplatform and Android modules with their source-set excludes
  (#397, #955).
- `nitpicker init` sets a project up (config, install command, agent skill matching the installed
  version, CI with `--ci github`) and checks the TypeScript peers, plus `--version` and a full
  `--help`; a typo in a flag, subcommand or config key suggests the closest one (#495, #696, #932,
  #939, #940).
- A GitHub Action with a job summary and annotations, and CI recipes for GitHub Actions, GitLab CI
  and Jenkins (#512).
- A JSON Schema for `nitpicker.config.json`, structured fix hints in findings, a rule reference, and
  the `nitpicker explain` and `nitpicker rules` commands (#526, #527).
- Paths on the command line check one file or folder, `--json` prints one compact result on stdout,
  and a run with no change since the base skips the analysis (#698, #699, #943).
- Project config opt-ins with `tools.<tool>.precedence`: ESLint, knip, dependency-cruiser, ruff
  lint, coverage.py, SpotBugs, Error Prone, Stryker, TypeScript compiler options and test runner
  retries (#557, #576, #577, #579, #580, #608, #609, #627, #629, #634).
- Analyzer timeouts are configurable (#615), and projects without `node_modules` get a local
  findings cache (#693).
- Tested on macOS, Windows and Deno, with a compatibility table, and the TypeScript 7 type check
  runs under Deno and Bun (#525, #614).
- Failing tests of the change lead the summary, with each failure's location and expected and
  received values, and exit 1 (#719, #730).
- Compile errors in the change are reported as findings, and Gradle failures are condensed (#966).
- Java and Kotlin comparisons reuse the base's PIT results on the head (#962).

### Changed

Stricter rules, which can fail code that passed before:

- Policy review: a change to `nitpicker.config.json` that checks less than the base fails with
  `nitpicker-config/policy-loosened` until a person accepts it with `--accept-policy-change=<digest>`
  or `NITPICKER_ACCEPT_POLICY_CHANGE=<digest>` (#265, #274).
- A change to the build or test selection that checks less (Gradle `sourceSets` or `exclude`, Maven
  source directories and surefire excludes, pytest `testpaths` and `--ignore`, `do_not_mutate`,
  opted-in tool configs) is a policy loosening in Python, Java and Kotlin too (#385).
- `repository-hygiene` fails a change that commits `.env` files, private keys, archives, binaries,
  files over 1 MB or build output (#289).
- New console output from tests (`console.error` and `console.warn`, or warnings in the JUnit XML)
  fails, in every preset, with `testConsole.allow` for known messages (#264, #292, #391).
- Copies: a renamed copy fails `duplicates/duplicate-clone` in every preset, and a change that edits
  only one of two near-identical copies fails `sibling-copy-edit` (#259, #384).
- TypeScript and JavaScript tests follow honest-test rules (no disabled tests, real clock,
  `Math.random`, network or unrestored fakes), have 5 and 30 second budgets, and mutation testing
  notices weakened tests of unchanged code (#287, #288, #294).
- TypeScript and JavaScript: security rules for SQL built from strings, MD5 and SHA-1, disabled TLS
  checks, HTTP calls without a timeout and unsafe deserialization (#257, #265, #278).
- TypeScript, JavaScript and React: dev dependencies in production code, unused, unlisted and
  unresolved dependencies, hidden test-only exports, and more React mistakes (#226, #267, #268,
  #289).
- TypeScript and JavaScript tests: an assertion in a callback the test does not wait for (#491).
- Python: the one-way rules of the other presets, swallowed errors, logged errors without a
  traceback, tests without an assertion, and the security rules (#228, #273, #277, #283).
- Python: async cancellation that is swallowed or replaced, resources closed while a child task can
  still use them, and unshielded `await` in Trio or AnyIO cleanup (#377, #484).
- Java: PMD's `performance`, `multithreading` and `security` categories, on Gradle and Maven (#374).
- Java and Kotlin: the review checks of the TypeScript preset, such as fixed sleeps in tests, an
  unused `@SpringBootTest` context, test classes without tests, hand-written enum subsets and
  test-only exports (#292).
- Java and Kotlin: limits on class size (20 methods, 10 fields, inheritance depth 3) and folder depth,
  with initializers, lambdas and local functions measured as their own units (#229, #276, #290).
- Java and Kotlin: Spring configuration, bean, proxy, transaction, web, security, JPA and Spring Data
  rules with the same rule ids in both languages, and ArchUnit checks of layering and package layout
  (#279, #388, #398, #513).
- Java and Kotlin Spring projects: a controller that holds a controller, a repository that depends on
  a service, and a singleton that takes a request or session scoped bean without a proxy (#486).
- Java and Kotlin projects on jMolecules: an aggregate that holds another aggregate's root or entity,
  and a value object that holds an entity (#498).
- Java and Kotlin Spring projects: request data stored in a singleton or static field (#542).
- Java and Kotlin: external effects that run while a class or file loads (#518).
- Python: domain purity follows effects through project helpers, and effects at import time fail
  (#503).
- Kotlin: the security, logging and review checks of the other presets, lint for Kotlin tests, and
  coroutine test rules such as `delay` on a real dispatcher inside `runTest` (#250, #380, #382,
  #489).
- A slow test that the change adds fails in every preset, Java included (#242, #287).

- Java: the patterns agents get wrong, on Gradle and Maven: `Optional` misuse, cast after
  `instanceof`, sneaky throws, swallowed interrupts, `Collectors.toList`, unclosed streams, side
  effects in `forEach`, SQL built by concatenation, nested regex quantifiers, honest-test rules
  (sleeps, disabled tests, assertions in control flow), banned APIs, renamed clones, package cycles,
  unused declared dependencies and `javac -Xlint` (#275).
- Java: the full PIT mutator set, and Javadoc and KDoc content follows the shared doc-comment rule
  (#635, #694).
- Every preset: service lookups outside composition points, method forwarding aliases in one class,
  unbounded fan-out of remote calls (also through Reactor, Kotlin Flow and RxJS), blocking calls in
  async code, timeout scopes that cannot cancel and timeouts that leave the work running, cleanup
  that can be cancelled and tasks that outlive their resource, lock-order inversions and
  inconsistently locked fields, and one way for command-line programs to write to standard output
  (#550, #551, #558, #564, #565, #570, #601, #625, #861).
- Every preset: tri-state booleans, falsy defaults, reassigned parameters, compatibility shims and
  naive datetimes; unused parameters; shared state updated across `await` or a suspend call (#371,
  #487, #566).
- Tests in every preset: weak assertions, exact float comparisons, assertions in loops, retries set
  in test code (and a test that passes only on a rerun or retry fails), tests that copy a production
  constant, process-wide state changed without restoring it, mutable state shared by tests, tests
  that mock the class under test, mocks without a spec, relaxed MockK mocks and patches that miss
  the lookup, inverse functions no test round-trips, and containers or servers started for each test
  (#585, #628, #631, #632, #700, #701, #703, #720, #858, #860, #862, #937, #941, #953, #965, #1012).
- Data access in every preset: rows counted, filtered, sorted or aggregated in memory, streamed rows
  collected into one collection, unordered pages and unbounded query arrays, two to-many relations
  joined in one query, foreign keys without an index, eager relations and cascading removes on
  many-to-many, ORM schema sync at startup and query logging, and migrations added out of order or
  with hardcoded names (#824, #854, #857, #914, #926, #969, #970, #982, #986, #988, #990, #1026).
- Correctness: unhandled rejections of void promises, writes to properties of parameter objects,
  recursive map updates, URI parsing of runtime text outside a handled parse, numbers tested for
  truthiness, singular and plural inputs, unchecked schema fields, partial enum and union
  predicates, subprocess waits without a timeout, streams and clients without an `error` listener,
  dates in the server's time zone, log arguments that do not match the format (Java and Kotlin),
  reused stateful regexes, closeables nothing closes, shareable objects built on every call, seconds
  mixed with milliseconds and 32-bit epoch times, generated `equals`/`hashCode`/`toString` over
  cyclic or inherited fields, request numbers, booleans and dates read without conversion,
  collection forms with a cheaper equivalent, and environment reads outside the composition root
  (Java and Kotlin) (#819, #820, #823, #825, #826, #847, #848, #851, #852, #853, #855, #856, #863,
  #864, #919, #921, #922, #945, #959, #961).
- Logic: boolean logic with a simpler exact form, conditions earlier guards already decide
  (TypeScript and JavaScript), copy slips in operands such as the same operand twice or
  contradicting comparisons, and the TypeScript logic rules the presets left off (#911, #913, #915,
  #968, #979, #985, #987, #989).
- Regular expressions in every preset except Go: parts that never change the match, duplicates,
  misleading assertions, forms with a shorter equivalent and super-linear backtracking (#918, #927).
- Spring (Java and Kotlin): more proxy annotations (Resilience4j, Micrometer, JSR-250, method
  validation and the project's own), reactive `findAll` filters, static post-processor beans, beans
  that never release what they start, writes outside a transaction or in a read-only one, cache
  writes inside one, untyped request body fields, property keys that bind to nothing, exceptions
  that reach the client as a 500, and HTTP calls without a timeout in every Java project (#818,
  #849, #850, #859, #865, #866, #924, #950, #978).
- Java and Kotlin: duplicate, copy-edit and name-collision rules, shared classes that only one
  feature uses, Kotlin validation annotations without a use-site target, and generated Kotlin
  mutants are filtered and the rest enforced (#412, #606, #637, #949).
- Python: `typing.cast` and explicit `Any`, reviewed Ruff pitfall families, unresolved imports,
  assertions in test control flow and switched-off tests, and the shared feature boundary rules
  (#372, #373, #449, #477, #636).

Other changes:

- Boundary validation and catch-block logging rules follow the libraries the project uses (valibot,
  yup, joi, winston and others, not only zod and pino), and Spring test-profile checks follow the
  project's own profile names (#263).
- Project tool configs for ruff, black, mypy, pyright, mutmut, ktlint, ktfmt and detekt are read only
  when `tools.<tool>.precedence` lists `"project"` (#266, #273).
- Python complexity comes from the syntax tree, and a flat `else if` chain counts as one nesting level
  in Python, TypeScript and Java (#227).
- Gradle failures show the failure block first and link the full build log (#307).
- The console summary groups policy loosenings by kind and prints the digest and the acceptance
  command once (#370).

- Legacy findings stay legacy across moves, renames, reformatting, new parameters, overloads and
  repeats, and count findings on legacy code are held at their base count (#573, #612, #621, #623,
  #722, #723).
- The console summary groups findings by rule, prints each exception entry once, folds mutation
  entries per function and shows report-only design findings; output off a terminal is plain (#537,
  #689, #702, #718).
- TypeScript and JavaScript `--fix` writes safely and touches only the files the gate checks;
  formatter findings name `nitpicker --fix` or the exact command (#613, #931, #947).
- Project facts come from the Git file set, not the whole tree, and the preset is checked against
  the folder's build files when the config loads (#521, #958).
- A run that checked only the analyzers named with `--analyzer` says so (#690).

### Fixed

- TypeScript: the type-aware lint rules run on projects whose tsconfig sets `rootDir`, `rootDirs`,
  `isolatedDeclarations`, an option TypeScript 7 removed, or a `types` entry that is not installed.
  Any other tsconfig error oxlint reports now fails the ESLint analyzer with a message naming it,
  instead of reporting without the type-aware findings (#1056).
- Maven: a project that binds its own JaCoCo `prepare-agent` (Spring Boot apps often do) no longer
  aborts its test JVM with two JaCoCo agents; nitpicker's agent runs at the project's JaCoCo version
  (#1052).
- Java 25 class files: JaCoCo moves to 0.8.16, PIT to 1.22.1 and SpotBugs to 4.9.8. Before, a
  Java 25 build lost coverage and mutation results to a tool error, and SpotBugs reported nothing
  without saying so (#1068).
- Java 25 sources: Checkstyle moves to 13.5.0, PMD to 7.16.0, google-java-format to 1.35.0 and
  palantir-java-format to 2.90.0, so module imports and statements before `super(...)` parse; the
  formatter check no longer comes back empty when the formatter fails. Checkstyle and the
  formatters run on JDK 21 or newer, and the source parsers and `--fix` run on a JDK that reads the
  project's language level (#1068). PMD findings of every priority still fail the gate, though
  PMD 7.16 marks its lower priorities as notes.
- An uncommitted edit made in the same second as the last index write is no longer analyzed as the
  old content (#258).
- A timed-out Gradle build is stopped, with the processes it started, before the next snapshot
  begins (#312).
- A `**/` exclude no longer crashes the dependency analyzers (#306).
- Mutation testing keeps running when the project already has TypeScript errors (#295).
- Gradle: excluded JUnit tags stay out of mutation runs, modules without Java sources are not
  formatted, and architecture tests no longer change application coverage (#309, #310, #311).
- Import-only clones are no longer reported, and an `exclude` on either file of a clone lifts it
  (#231).
- A branch that changes `layout` no longer reports existing test-helper findings as new (#386).
- SARIF locations are relative to the repository root, so code scanning resolves them in a project
  in a subfolder, and the files hold no absolute path of the machine that ran them (#517).

- `nitpicker cache publish` refuses options it does not take, such as `--rule` and `--defer-exit`,
  which it used to ignore.
- oxlint no longer fails with "oxlint planning exited with 2" when nitpicker is installed under a
  `node_modules` folder that `.gitignore` lists.
- Coverage gaps no honest change can close are no longer reported, project settings and annotations
  no longer hide code from coverage, and mutants of unreached code count as not covered in diff runs
  (#528, #691, #692).
- Base findings are recomputed when nitpicker itself changes, and a fresh consumer install no longer
  trusts a stale npm cache (#538, #736).
- Vite loads through Vitest, so pnpm projects run coverage and mutation, and `file:` packages
  outside the repository install for the base (#586, #618).
- Jest, `node:test` and Mocha console output is attributed to the right test and file (#602, #610,
  #626, #930).
- Type check config diagnostics point at the project's `tsconfig`, and Stryker's TypeScript 7
  checker runs in comparisons (#603, #731).
- Gradle: included plugin builds and `buildSrc` stay unconfigured, task dependencies are no longer
  resolved while projects configure, and Spring AOT and generated source sets are left out of the
  Java analysis (#604, #724, #732).
- Repository-local Git variables a hook passes no longer leak into nitpicker, a base is found in a
  repository without a remote, and a killed build that blocks worktree cleanup keeps the report
  (#605, #697, #717).
- Only the `reports/quality` output folder is skipped, not every `reports` folder (#617).
- SARIF columns, base ids and file size fit code scanning (#624).
- Diff worktrees are checked out under the real temp path, which fixes runs on Windows with short
  temp paths (#993).
- A Node.js older than 22.14 gets a message naming the required version instead of a crash (#695).

### Upgrade notes

- Checkstyle 13.5 renames some rules: `checkstyle/MemberName` is now
  `checkstyle/GoogleNonConstantFieldName`, `checkstyle/OperatorWrap` is `OperatorWrapNL` or
  `OperatorWrapEOL`, and `checkstyle/AnnotationLocationMostCases` is
  `AnnotationLocationMethodsAndCtors` or `AnnotationLocationTypeAndPackage`. A check with an `id`
  reports as that id. Rename `exceptions` entries that use the old names.
- Checkstyle and the Java formatters need JDK 21 or newer to run. The project can still compile
  for an older release; nitpicker finds an installed JDK 21 (or a Gradle toolchain) for them.
- `vitest` and `@vitest/coverage-v8` are needed only when Vitest is your test runner. Install the
  peers of the runner you use.
- A `react` key with `"preset": "javascript"` is a configuration error. Use the TypeScript preset for
  React.
- `lizard` is no longer needed for Python.
- A project that relied on nitpicker reading its own `pyproject.toml`, `mypy.ini`, detekt or ktlint
  settings now needs the `"project"` opt-in described in
  [Your project's tool configs](https://github.com/jhonDoe15/nitpicker/blob/main/docs/usage.md#your-projects-tool-configs).
- Expect new findings wherever a rule above is stricter. Only the findings a change adds fail it;
  existing code stays baselined.
- Drop `--rule` and `--defer-exit` from a `nitpicker cache publish` step: it now refuses them.
- Go projects need the Go toolchain; the [Go
  guide](https://github.com/jhonDoe15/nitpicker/blob/main/docs/go-preset.md) lists the tools the
  preset runs.

## [0.1.0-rc.1] - 2026-10-16

### Added

- Presets for TypeScript (the default, with React rules), JavaScript, Python, Java (with Spring rules,
  on Gradle and Maven) and Kotlin (on Gradle).
- A comparison of the merge base with your change that fails only on new enforceable findings, with
  exit codes 0, 1 and 2, `report.txt`, `report.junit.xml`, `report.sarif`, `summary.json` and
  `new-findings.json`.
- `--all`, `--fix`, `--base`, sharding with `nitpicker aggregate`, a findings cache and
  `nitpicker cache publish`.
- `nitpicker.config.json` with exceptions, thresholds and custom analyzers.
- One agent skill per preset, shipped in the package.
- Install from an attached tarball with a checksum, for versions that are not on npm.

[Unreleased]: https://github.com/jhonDoe15/nitpicker/compare/v0.1.0-rc.2...HEAD
[0.1.0-rc.2]: https://github.com/jhonDoe15/nitpicker/releases/tag/v0.1.0-rc.2
[0.1.0-rc.1]: https://github.com/jhonDoe15/nitpicker/releases/tag/v0.1.0-rc.1
