# Changelog

All notable changes to nitpicker are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0.0, a minor release can contain breaking
changes and a patch release is fixes only.

Each release lists what was added, what changed (including rules that are stricter and can fail code
that passed before), what was fixed, and what to do when upgrading. A failure that is not a finding
about your code is explained in [troubleshooting](https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md).

## [Unreleased]

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
- `nitpicker changelog [<version>]` prints a version's entry from this changelog, which now ships in
  the package (#555).
- [Troubleshooting](https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md) explains
  each failure that is not a finding, and the messages whose fix needs more than they say link to
  their entry, for the version you run (#555).

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
- Kotlin: the security, logging and review checks of the other presets, lint for Kotlin tests, and
  coroutine test rules such as `delay` on a real dispatcher inside `runTest` (#250, #380, #382,
  #489).
- A slow test that the change adds fails in every preset, Java included (#242, #287).

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

### Fixed

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

### Upgrade notes

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

[Unreleased]: https://github.com/jhonDoe15/nitpicker/compare/v0.1.0-rc.1...HEAD
[0.1.0-rc.1]: https://github.com/jhonDoe15/nitpicker/releases/tag/v0.1.0-rc.1
