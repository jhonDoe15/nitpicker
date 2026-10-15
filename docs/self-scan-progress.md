# Self-scan cleanup progress

This branch is a draft checkpoint, not a completed cleanup. A full, uncached scan
with the repository's enabled analyzers reports **157 enforceable findings and no
tool errors**, compared with **708** at base commit
`5df2ad7d6c97e340877d3173ebdfac578372df8a`. This is a net reduction of 551;
the remaining findings include issues introduced by the refactoring.
The diagnostic snapshot is in [self-scan-findings.json](self-scan-findings.json).
Line numbers refer to the source checkpoint, before this documentation was added.

## Changes in this checkpoint

- Replace partial output assertions with complete expected values or anchored
  whole-text patterns. Expected-output fixtures keep the complete contracts
  explicit while allowing bounded temporary paths, hashes, and timing fields.
- Split large runners, configuration modules, reports, and test files by
  responsibility; update imports, executable paths, package scripts, and layout
  entry points for the new locations.
- Replace recursive syntax, dependency, and filesystem traversal with iterative
  traversal. Preserve scheduler dependency ordering and error propagation.
- Move reusable Git repositories, server initialization, package discovery, and
  process scenarios into suite setup; add explicit Git environment settings.
- Preserve caught error causes and replace production console calls with explicit
  stream writes. Remove unused exports and module-level mutable state.
- Hash transitive local module dependencies so extracted analyzer helpers still
  invalidate cached results. Three focused tests cover changes, unrelated files,
  cycles, and deterministic input ordering.
- Correct the Kotlin fixture's expected findings: growing the demo source folder
  from six files to twelve also violates the configured folder file limit.

No new rule exceptions, disabled analyzers, or raised thresholds were added.
The entry-point configuration changes identify scripts actually invoked as
executables. The pre-existing disabled analyzers remain `typescript-typecheck`,
`coverage`, `crap`, and `mutation`. The initial audit did not establish a documented
reason for these four being disabled; running their toolchains inside fixture tests
is not equivalent to running these analyzers against Nitpicker itself.

## Why the default run skips 256 tests

At the base commit, all 256 skips were opt-in integration tests:

| Group | Skipped tests | Opt-in |
|---|---:|---|
| Python preset and Python rule integration | 172 | `npm run test:python` |
| Java and Spring integration | 18 | `npm run test:java` |
| Kotlin metrics and preset integration | 41 | `npm run test:kotlin` |
| Installed consumer integration | 24 | `npm run test:installed` |
| Installed evaluation runner | 1 | `NITPICKER_EVAL_INSTALLED=1 npx vitest run evals/runner/run-case.test.mjs` |

The source documents real Python tools and PyPI network access for Python, Gradle
and downloaded JVM toolchains for Java/Kotlin, and package packing, consumer
installation, network access, and minutes of runtime for installed tests. These
are explicit environment gates rather than unexplained disabled unit tests.
The installed suite now also checks dependency topology for its applicable
installation strategy; skip counts therefore need not match the base exactly.

The audit ran every opt-in group at the base commit. Times exclude toolchain
installation and some runs overlapped, so these are elapsed observations rather
than isolated performance benchmarks.

| Run at the base commit | Passed | Failed | Skipped | Seconds | Relative to default |
|---|---:|---:|---:|---:|---:|
| Default | 3661 | 0 | 256 | 612.8 | 1.00x |
| Python | 172 | 0 | 0 | 654.5 | 1.07x |
| Java/Spring | 18 | 0 | 0 | 597.5 | 0.98x |
| Kotlin | 40 | 1 | 0 | 696.2 | 1.14x |
| Installed consumer | 24 | 0 | 0 | 243.8 | 0.40x |
| Installed evaluation runner | 18 | 0 | 0 | 26.7 | 0.04x |

The evaluation run includes 17 default tests and one additional opt-in test.
The Kotlin failure was the stale expected folder-limit finding described above;
adding that expected item passed an isolated reproduction. These base results
must not be treated as validation of every change in this branch.

## What CI checks

[The TypeScript workflow](../.github/workflows/typescript.yml) runs the default
suite and conformance suite. It does not set the integration opt-in variables
above. Pull requests also run `node core/cli.mjs --output reports/nitpicker` in a
separate self-gate job. That gate compares against the merge base: existing
findings remain baselined. It does not require a clean whole-tree `--all` scan.
The base commit passed the diff gate while its full scan reported 708 findings.
A push to main does not run that PR-only self-gate.

## Validation of the cleanup

The stable default-suite rerun is in progress at publication of this checkpoint;
its result will be recorded before this PR becomes ready for review. Earlier
intermediate full runs had failures during the refactor and are not a green
validation result. The Python/JVM/installed suites have not yet been rerun against
the complete refactored branch.

Focused runs passed for the scheduler (28 tests), traversal and rule behavior
(285), callback/public-contract behavior (13), and transitive cache hashing (3).
The full uncached self-scan completed in 51.4 seconds, with 157 findings and zero
tool errors. `git diff --check` passed. All 454 changed JavaScript modules
also passed `node --check`.

## Remaining blockers

While this audit was running, main advanced to
`32171099a0b71870291aaebe78b74a95c07be555` with the oxlint integration from PR #197.
This checkpoint is based on the earlier audit commit, and GitHub reports merge
conflicts. Integrating those changes is an additional blocker. The 708-to-157
comparison describes the audited base and this branch, not a scan of the new main.


| Rule | Findings |
|---|---:|
| `function-control-nesting-limit` | 23 |
| `@typescript-eslint/no-unused-vars` | 22 |
| `@typescript-eslint/no-unnecessary-template-expression` | 18 |
| `function-statements-limit` | 16 |
| `function-lines-limit` | 15 |
| `exports` | 14 |
| `nitpicker/no-raised-test-timeout` | 13 |
| `nitpicker/cognitive-complexity` | 10 |
| `nitpicker/no-node-process-per-test` | 7 |
| `nitpicker/no-silent-catch` | 4 |
| `line-length-limit` | 3 |
| `@typescript-eslint/no-confusing-void-expression` | 2 |
| `file-lines-limit` | 2 |
| `folder-files-limit` | 2 |
| `no-restricted-syntax` | 2 |
| `nitpicker/hermetic-git-in-tests` | 1 |
| `nitpicker/test-must-use-production-runtime` | 1 |
| `no-production-cycles` | 1 |
| `no-production-runtime` | 1 |

In particular, the extracted test-execution and quality-check modules currently
form a production dependency cycle. Remaining work also includes structural
limits, unused exports/imports, test lifecycle/runtime checks, and lint cleanups.
Resolve the diagnostics, pass the stable full suite, rerun all opt-in integration
suites, and verify the PR's diff gate before marking this PR ready. No claim of
complete compliance or merge readiness is made by this checkpoint.
