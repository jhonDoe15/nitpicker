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

- Test runners: coverage, CRAP and mutation testing run with the runner the project already uses
  (Vitest, Jest, `node:test` or Mocha), chosen from `tools.tests.runner`, the `test` script, the
  runner's config files or the dependencies (#269).
- `tools.typescript.project` selects the project's own TypeScript config for the type check and the
  mutation checker (#305).
- `tools.tests.timeouts` sets test and hook deadlines per language and named project (#368).
- `NITPICKER_GRADLE_TIMEOUT_MINUTES` raises the 15 minute budget of each Gradle command (#308).
- Console output from tests: a change fails when a test starts printing new `console.error` or
  `console.warn` output, on Vitest, Jest, `node:test` and Mocha, with `testConsole.allow` for known
  messages (#264, #391).
- Renamed copies: copy-pasted code whose names and literals were changed fails
  `duplicates/duplicate-clone` in TypeScript, JavaScript, Python and Kotlin, as it already did in
  Java (#384).
- `sibling-copy-edit`: a change that edits only one of two near-identical copies fails (#259).
- Project conventions: nitpicker measures and follows the project's quotes, line length and
  indentation (Python), indentation, trailing commas and wildcard imports (Kotlin), type imports, file
  name casing, JSX style and JSON or YAML indentation (TypeScript), and its formatter and line length
  (Java) (#261, #266, #280).
- Python: Django and nose2 runners, mutation of unittest suites, environments for pipenv, hatch and
  conda, a separate environment for a base whose dependencies differ, basedpyright, and opt-in project
  configs through `tools.pyright`, `tools.mypy`, `tools.mutmut`, `tools.ruff` and `tools.black`
  (#272, #273, #281, #286).
- Java and Kotlin: every Gradle `Test` task that `check` runs, JUnit 4, TestNG, Spock and Kotest
  projects, every Gradle project of a multi-project build, and ArchUnit checks of Spring layering and
  package layout (#242, #279, #387, #389).
- Spring configuration files and common Spring and JPA mistakes are checked, including `javax.*`
  projects (#388).
- `spring.roles` in the `java` and `kotlin` presets marks the project's own annotations or supertypes
  as controllers, services or repositories for the Spring architecture checks (#486).
- Kotlin: the security, logging and review checks of the other presets, and Kotlin tests are linted
  (#250, #380, #382).
- Policy review: a change to `nitpicker.config.json` that checks less than the base fails with a
  `nitpicker-config/policy-loosened` finding. A person who reviews the change accepts it with
  `--accept-policy-change=<digest>` at a terminal, or `NITPICKER_ACCEPT_POLICY_CHANGE=<digest>` in CI
  (#265, #274).
- Every finding that can be intended ends with the exact `exceptions` entry to add, in every preset
  (#396).
- The base of a TypeScript or JavaScript comparison is installed with the project's own package
  manager: pnpm, Yarn or Bun, not only npm (#282).
- `"history": { "coChange": true }` turns on a report-only `change-history/co-change` analyzer in
  every preset: it names production modules that keep changing together in the Git history (#492).
- `report-baseline.sarif` adds the held findings as `unchanged` next to `report.sarif`, which keeps
  only the new findings for code scanning, and `--all` writes `report.sarif` too (#517).
- `nitpicker changelog [<version>]` prints what changed in a version, from this changelog, which now
  ships in the package.
- `repository-hygiene` fails a change that commits `.env` files, private keys, archives, binaries,
  files over 1 MB or build output folders (#289).

### Changed

Stricter rules, which can fail code that passed before:

- TypeScript and JavaScript: tests are held to honest-test rules (disabled tests, the real clock,
  `Math.random`, the network, unrestored fakes, copy-pasted tests, files the runner never collects),
  unit tests have a 5 second and integration tests a 30 second budget, synchronous subprocess calls in
  tests need a deadline, and mutation testing notices a change that weakens the tests of unchanged
  code (#287, #288, #294).
- TypeScript and JavaScript: new security rules for SQL built from strings, MD5 and SHA-1, disabled
  TLS verification, HTTP calls without a timeout and unsafe deserialization, plus more written forms
  of the existing production rules (#257, #265, #278).
- TypeScript, JavaScript and React: a dev dependency imported from production code, unused,
  unlisted and unresolved dependencies, test-only exports that a re-export hides, and more React
  mistakes (effects that fetch or derive state, direct DOM access, random keys, unlabelled fields)
  now fail (#226, #267, #268, #289).
- Python: the one-way rules of the other presets, swallowed errors, logging an error without its
  traceback, tests without an assertion, and the security rules of the TypeScript preset (#228, #273,
  #277, #283).
- Java and Kotlin: limits on class size (20 methods, 10 fields, inheritance depth 3) and folder
  depth, Java initializers, lambdas and local functions are measured as their own units, and Kotlin
  `init` blocks and property initializers are measured (#229, #276, #290).
- A change to the build or the test selection that makes a Python, Java or Kotlin project check less
  (Gradle `sourceSets` or `exclude`, Maven source directories and surefire excludes, pytest
  `testpaths` and `--ignore`, `do_not_mutate`, opted-in tool configs) is a policy loosening that a
  person must accept, as in TypeScript (#385).
- Kotlin: the Spring bean, configuration, proxy, transaction, web, security, JPA and Spring Data
  rules of the Java preset run on Kotlin sources too, with the same rule ids, so one exception covers
  both languages (#398, #513).
- Java and Kotlin Spring projects: a controller that holds another controller, a repository that
  depends on a service, and a singleton bean that takes a request or session scoped bean without a
  scoped proxy now fail (#486).
- Java and Kotlin projects that use jMolecules: an aggregate that holds another aggregate's root or
  entity, and a value object that holds an entity, now fail (#498).
- Python: an async cancellation handler that swallows or replaces the cancellation, a resource
  closed while a child task can still use it, and an unshielded `await` in Trio or AnyIO cleanup now
  fail (#377, #484).
- Kotlin tests: `delay` on a real dispatcher inside `runTest`, coroutines that escape the test,
  disabled or focused tests, and assertions inside `if`, `when` or loops over case tables now fail
  (#489).
- A slow test the change adds fails in Java, and the 5 and 30 second budgets apply to every preset
  (#242, #287).
- Project tool configs for ruff, black, mypy, pyright, mutmut, ktlint, ktfmt and detekt are read
  only when `tools.<tool>.precedence` lists `"project"` (#266, #273).
- Gradle failures show the failure block first and link the full build log (#307).
- The console summary groups policy loosenings by kind, explains each kind once and prints the digest
  and the acceptance command once (#370).
- Python complexity is computed from the syntax tree, and a flat `else if` chain counts as one
  nesting level in Python, TypeScript and Java (#227).

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
- Expect new findings in code that passed before wherever a rule above is stricter. They are
  reported as new on the first comparison after upgrading only if the change adds them; existing code
  stays baselined.

## [0.1.0-rc.1] - 2026-10-16

First release candidate: a quality gate for code written by coding agents. It narrows each language
to one allowed way of doing each thing and fails a change only for the problems it adds. Rules,
messages and config keys can still change before 0.1.0.

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
