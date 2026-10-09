# TypeScript strict preset

Status: implemented (ticket S13). Strict is the only TypeScript preset; there is no lax rule set.
The "Decisions" section below records the owner-review decisions that S13 follows.

The preset allows one way to write each construct, and enforces it mechanically. Every banned form
fails with a message naming the allowed form. Strict is the TypeScript preset's only mode: it
replaces the current rules rather than sitting beside them as a separate preset. An exception exists
only in the nitpicker config file, where it changes the policy hash and appears in the report.
Existing code that violates a rule is baselined by the differential gate. New and touched code must
comply.

The rules are modeled on publicly described "one paved road" conventions, such as Lauren Tan's talks
on her Dune conventions: one allowed form per construct, repeated review feedback turned into lint
rules, mechanically enforced boundaries, and exceptions handled as reviewed changes. No code is
reused; those conventions aren't published as code.

The preset fixes the layout below, so the boundary rules can be generic. A `layout` override in the
config file is an exception like any other.

## Layout and boundaries

- Each feature lives in `src/main/features/<name>/` and exposes a public `index.ts`. Other code
  imports a feature only through that file. A new feature is a new directory, not a new branch in a
  shared entry point.
- `features/<name>/domain/` holds pure logic: functional core, imperative shell, using hexagonal
  architecture's folder names. It may not import `adapters/`, Node I/O modules, network or database
  clients, the logger, or module state. Time, IDs, and randomness arrive as parameters.
- `features/<name>/adapters/` performs I/O and calls `domain/`. A feature with no I/O has no
  `adapters/` folder.
- Shared code does not import features. Features do not import the composition root. Import cycles
  are not allowed.
- Objects are constructed only in the composition root. Dependencies are passed explicitly. No
  module-level `let`.

## Inside `domain/`

- `const` only. No mutation: no `push`, property assignment, or `delete`. Parameters and data types
  are `readonly`.
- Transforms use `map`, `filter`, `flatMap`, `reduce` with an initial value (`xs.reduce((sum, x) =>
sum + x, 0)`), `Object.fromEntries`, and `Object.groupBy`. No loops, `forEach`, `reduce` without
  an initial value, or `reduceRight`.
- No classes and no `this`. No recursion: a custom rule flags a function that calls itself.
- Expected failures are returned as discriminated unions, never thrown. TypeScript has no checked
  exceptions, so a result type is the only way the compiler forces every caller to handle a new
  failure case, which is the gate steering the author. It also keeps `domain/` pure. The cost is
  unwrapping at call sites and converting library exceptions at the adapter boundary.
- Illegal states are made unrepresentable with discriminated unions.

## Inside `adapters/`

- Throw only for unexpected failures, using `Error` subclasses that preserve `cause`. Convert
  library exceptions into domain results at the boundary. No silent catches.
- Untrusted input is parsed once, at the boundary, with zod. Hand-written type guards for external
  data are not allowed.

## Everywhere

- `for...of` is the only loop, in all production code (not just `adapters/`). No `forEach`,
  `for(;;)`, `for...in`, `while`, or `do...while`. `domain/` is stricter and has no loops at all.
- `async`/`await` and `Promise.all`. No `.then()`, `.catch()` or `.finally()` chains, and no promise
  left without being awaited (`@typescript-eslint/no-floating-promises`).
- `===` and `!==` only (`eqeqeq`).
- Config files are exempt from the loop, `forEach` and promise-chain bans; `eqeqeq` still applies.
- Named functions use the `function` keyword; arrow functions only as callbacks.
- `type`, never `interface`. No `enum` (use unions of string literals) and no `namespace`.
- Classes only for `Error` subclasses.
- Named exports only; config files are exempt.
- Early returns; no `else` after a `return`; no nested ternaries.
- A `switch` over a discriminated union must handle every case.
- No `as`, `any`, or non-null assertions.
- `undefined` only for absent values. `null` only where a library or JSON requires it.
- No comments. Tool directives are allowed, except suppressions: ESLint's `noInlineConfig` blocks
  inline disables, and `@typescript-eslint/ban-ts-comment` bans `@ts-ignore`, `@ts-expect-error`,
  and `@ts-nocheck`. `noInlineConfig` alone does not cover TypeScript suppressions.

## Inside tests

These rules cover every file of the test layout area (`<testRoot>/**`, `*.test.*` and `*.spec.*`
next to sources, and `__tests__/`). They ban forms that make a suite slow or non-hermetic. Each one
came from nitpicker's own suite, where it cost CI minutes. "Per test" means code that runs in an
`it`/`test` callback or in `beforeEach`. That includes same-file functions those callbacks call, but
not functions imported from other modules.

- `nitpicker/no-git-repository-per-test`: no `git init` or `git clone` per test. This covers direct
  `child_process`/`execa` calls and same-file wrappers such as `git(root, ['init'])` or
  `run('git', ['init'])`. Build a template repository once in `beforeAll` and `cpSync` it per test.
- `nitpicker/hermetic-git-in-tests`: every git process a test-area file starts passes an `env`
  object, written in that file, that sets `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_NOSYSTEM`. Same-file
  `const` objects and spreads count. An imported env object does not, because the rule cannot see
  it. Keep the git helper in one fixture file so the env is written once.
- `nitpicker/no-node-process-per-test`: no Node process per test. That covers `process.execPath`,
  `node`, `npx`/`npm`/`pnpm`/`yarn`/`bunx`/`tsx`/`ts-node`, a `node_modules/.bin` path, and `fork`.
  Import the function instead. Start the application as a process only through the `AppProcess`
  harness in `<testRoot>/fixtures/app-process.ts`, the subprocess bridge that the `test-runtime`
  analyzer recognizes. Spawning once in `beforeAll` is allowed.
- `nitpicker/no-server-or-worker-per-test`: no `createServer`/`createSecureServer`/`new Server`
  from `node:http`, `https`, `http2`, `net` or `tls`, and no `new Worker` from
  `node:worker_threads`, per test. Start them once in `beforeAll` and reset state between tests, or
  test the logic against an in-memory implementation.
- `nitpicker/no-fixed-sleep-synchronization` (existing, extended): besides `await sleep()` and
  `await new Promise((resolve) => setTimeout(resolve, n))`, it also flags
  `setTimeout(() => resolve(), n)`, `await setTimeout(n)` from `node:timers/promises` and
  `scheduler.wait(n)`. Wait on a condition with `vi.waitFor` or `expect.poll`.
- `nitpicker/no-raised-test-timeout`: no test, suite or hook timeout above 10 000 ms. That is the
  `testTimeout` nitpicker runs a project's tests with (`preset/defaults/vitest.quality.config.ts`,
  `stryker.vitest.config.ts` and the coverage runner's `--testTimeout`; a test keeps them in step).
  The rule covers the third argument of `it`/`test`, `{ timeout }` options, hook timeouts and
  `vi.setConfig`. A timeout that is not a constant written in the file is also reported. There is
  no e2e exemption; a genuinely long suite needs an exception in the config file.
- `nitpicker/no-first-test-charged-setup`: no lazily memoized shared setup that tests reach. It
  reports a call whose value is stored in a module-level `let`/`var` only while that variable is
  empty (`x ??= expensive()`, `x ||= call()`, `x = x ?? call()`, `if (!x) x = call()`,
  `if (x === undefined) { x = call() }`, or `if (x) return x; x = call()`), when an `it`/`test`
  body or `beforeEach` runs it, directly or through same-file helpers. The first test to run pays
  for the setup, reports show that test as slow, and test order matters. Compute it in
  `beforeAll`. Constants, `new` expressions and calls on `path`, `Math`, `Object`, `JSON` and
  similar built-ins are not reported. A deliberate memo needs an exception in the config file.
- `nitpicker/no-uninjectable-delay` (production code, not tests): `setTimeout`/`setInterval`
  (global, `globalThis`, or from `node:timers`/`node:timers/promises`) whose delay is a module-level
  `const` of 500 ms or more, inside an exported top-level function that has no parameter which
  could carry the delay. A destructured, defaulted or rest parameter, or one named like
  `options`/`config`/`delayMs`/`timeoutMs`, counts as able to carry it. Inline numbers, delays set
  inside a non-exported helper and class methods are not reported. Tests cannot shorten such a
  delay without fake timers, so accept it as an option with the constant as its default.
- `nitpicker/test-tsconfig-pins-lib-and-types`: a tsconfig object a test serializes with
  `JSON.stringify` must set `compilerOptions.types` and `compilerOptions.lib` (or `noLib`), so a
  fixture `tsc` run does not load every `@types` package and the full default lib. If
  `compilerOptions` spreads an object the rule cannot resolve, it is not checked.
- `nitpicker/no-process-globals-outside-main-guard`: test helper and fixture scripts (test-area
  files that are not `*.test.*`/`*.spec.*`) use `process.argv`, `process.exit` and
  `process.exitCode` only inside a main guard: an `if` whose condition uses `import.meta` (such as
  `import.meta.main`) or `require.main`. Export a function that takes the arguments and returns the
  exit code, so tests can import it instead of spawning it.

Left out, from the same write-up: recomputing one expensive result in every test, and running the
whole pipeline to check a decision made earlier. Both need a heuristic (repeated constant arguments
across tests, or what an assertion depends on), so a finding would not reliably mean a slow test.
Vitest's worker count in CI is a CI setting, not code. It belongs in the CI workflow or in a check
of the project's CI files, not in these rules. That check would need its own analyzer (a runner
kind, a version entry, a check definition and project-level findings) and is not built yet.

## How it is enforced

- `preset/defaults/eslint.config.mjs` (the `eslint-lint` analyzer) adds `strictPresetConfig()` from
  `preset/eslint-config/strict.mjs` to typescript-eslint's strict type-checked config. Rules that
  strict replaces are removed: `consistent-type-assertions`, `explicit-member-accessibility` and
  `no-unsafe-type-assertion` (the `as`, class and member bans cover them), and `no-explicit-any` and
  `no-non-null-assertion` are off in production code because the strict selectors report the same
  sites with a message that names the allowed form.
- `no-restricted-syntax` is one rule with one list per scope. ESLint flat config replaces a rule's
  options when several config objects match the same file, so each scope carries the complete list:
  `restrictedSyntaxByScope` in `strict.mjs` has `source`, `configFile`, `domain` and `adapters`, and
  the `domain` and `adapters` lists contain the `source` list plus their own selectors. The
  control-flow selectors live in `strict-control-flow.mjs` and are part of `source`; `domain` drops
  the loop and `forEach` ones because its own selectors report those nodes with a stricter message. Add a
  selector to the list of its scope; a test proves that a file under `features/x/domain/` gets both
  the global and the domain bans.
- The test rules live in `preset/eslint-config/strict-tests.mjs` (`strictTestConfigFor(layout)`),
  which `strictPresetConfig()` includes. They follow the layout's test roots and are strict rules,
  so the differential gate holds touched test code to them.
- `domain/` and `adapters/` rules are scoped by the globs `<sourceRoot>/main/features/*/domain/**`
  and `<sourceRoot>/main/features/*/adapters/**`. They follow the layout's source roots.
- The boundary rules (`preset/architecture/strict-boundary-rules.mjs`) are part of the default
  dependency-cruiser config used by the `dependency-architecture` analyzer.
- `src/main/composition-root.{ts,mts,js,mjs}` and `src/main/composition-root/index.*` are knip entry
  points, since nothing imports the composition root.
- Touched code is enforced by the diff engine (see "How touched code is detected").
- Exceptions go through `exceptions` in `nitpicker.config.json`. An exception names one rule id and
  turns that rule off for the listed paths. `no-restricted-syntax` is a single rule id, so an
  exception for it lifts every selector (all the syntax bans) for those paths; prefer fixing the
  code, and keep such exceptions narrow.
- `layout.excludedGlobs` and `layout.sourceRoots`/`layout.testRoots` are all valid `layout` keys. The
  roots must be directories; `excludedGlobs` are globs and replace the built-in exclusions.

## Enforcement sources

typescript-eslint (strict type-checked), `eslint-plugin-functional` scoped to `domain/`,
`no-restricted-syntax` selectors, nitpicker's custom rules, and dependency-cruiser for the layout
and boundary rules. `eslint-plugin-unicorn` is a candidate source.

## Open points

- Resolved: the default composition-root pattern of
  `no-managed-resource-construction-outside-composition-roots` is now only `main.ts`, `server.ts`
  and `composition-root.ts`; `*factory*.ts` no longer qualifies. The `compositionRootPattern` option
  extends these defaults and cannot replace them, so a project adds roots but cannot drop the
  defaults. The `no-module-level-let` rule has no exemption, including for composition roots.
- Whether nitpicker's own code must follow the preset. Today its engine uses banned forms, such as
  `while (pending.pop())` graph walks.

## Decisions

Status: Proposed, pending owner review. Each answer is a recommendation for the owner to accept or
change in review.

### zod: peer dependency or documented expectation

Recommendation: documented expectation, not a peer dependency.

The preset only requires that adapter code parse untrusted input with zod. Nitpicker's own runtime
never imports zod (it is not in `typescript/package.json`), so a peer dependency would make every
consumer install a package nitpicker does not use, and would break installs for projects that
choose to have no external-input boundary. The `strict` ESLint rule that would check this works on
syntax (a hand-written type guard on external data), not on which library parses it. Document in the
preset README that adapters are expected to use zod, and have the rule message name zod as the
allowed form. Revisit as a peer dependency (optional, via `peerDependenciesMeta`) only if a rule
needs to import from zod at lint time.

### Does nitpicker's own code follow the preset

Recommendation: not now. Follow the preset for new nitpicker code only after the port is complete,
and do not rewrite the engine.

Measured cost, from `typescript/core` and `typescript/preset` (non-test `.mjs`, about 7,300 lines):
the engine uses `let`, `for` loops and `while (pending.pop())` graph walks in roughly 180 places,
classes are rare, and the code is plain `.mjs` without TypeScript, so the type-based rules (`as`,
`any`, discriminated-union exhaustiveness) cannot apply at all. Porting it would be a large rewrite
with no user-visible benefit, and graph walks written without loops or recursion are harder to read.
Applied in S13: nitpicker's own sources are not rewritten and no config is added for them. A cheaper and honest path is the one the differential gate already provides: run nitpicker on
itself, with existing violations baselined, so any new or touched engine code must comply once the
preset runs on TypeScript sources. The layout (`src/main/features/...`) does not match the current
`core/` and `preset/` directories, so the repo needs either a layout override (an exception in its
own config, visible in the report) or a move; choose the override until the engine is TypeScript.

### How existing consumers upgrade

Recommendation: strict replaces the current rules in a single release, adopted through the baseline.

1. Ship the strict preset as a new major version, with a changelog listing every rule that fails.
2. The policy hash changes with the preset. The gate analyzes both the base worktree and the head
   (`core/diff/run-diff.mjs`), so existing violations appear on both sides and are baselined, not
   failed. The upgrade PR itself should be verified once to confirm the base side is analyzed with
   the new rules (checked in S13: the base side is analyzed with the head's policy, and a test shows a legacy
   violation staying baselined when the edit is elsewhere in the file).
3. Violations in files a PR does not touch stay baselined and never block it. Violations in touched
   code are enforced (see the next decision), so adoption is gradual and driven by ordinary edits.
4. Teams that cannot adopt a rule yet add an exception in the nitpicker config file, which changes
   the policy hash and appears in the report. There is no separate "legacy" preset.

### How touched code is detected and held to strict rules

Today the gate classifies a finding as new only when its comparison key is missing from the base.
The key (`typescript/core/diff/fingerprint.mjs`) is tool, rule, rename-mapped path, symbol,
identity, classification and metric name. It contains no line number, so an existing violation in an
edited file keeps matching the base and stays baselined. That is the behavior to change for strict.

Recommendation: line-hunk promotion, implemented in the diff engine (folded into S13 and
implemented there: `readChangedLines` in `core/diff/git.mjs`, applied by `compareFindings` in
`core/diff/compare.mjs`, with the rule set from `preset/strict-rules.mjs`).

- Compute the changed line ranges of each file on the head side from
  `git diff --unified=0 --find-renames <base>...HEAD` (the engine already shells out to git in
  `core/diff/git.mjs` for renames; hunk headers `@@ -a,b +c,d @@` give the head ranges `c..c+d-1`).
- After `compareFindings`, move a finding from `unchangedFindings` to `newFindings` when its rule
  is in the strict set and its head `location.line` falls inside a changed range of its file.
  Findings with no `location` (file- or graph-level findings) are promoted only when the file is
  newly added, not merely edited, to avoid blocking on whole-file metrics.
- A pure rename or move without content changes has no hunks, so rename-stable fingerprints still
  baseline it. A reformat that touches every line promotes everything in the file; that is
  acceptable, since reformatting is a touch, and it matches how the line-based tools below behave.
- Scope is rule-level, not tool-wide: only rules marked `strict` in the preset promote, so
  descriptive metrics (CRAP, duplication) keep their delta logic.

Prettier findings use the same promotion: the formatter reports one finding per differing region
(identity from the region's own text, `location.line` to `location.endLine` in the head file), and
`isStrictRule` includes `prettier/prettier`, so a legacy unformatted region stays baselined until an
edit overlaps it.

Rejected alternatives: whole-file promotion (a one-line edit in a large legacy file would force a
large cleanup and discourage small fixes); function-level promotion using symbols (more precise but
requires every analyzer to report symbol ranges, which they do not today). Function-level can replace
hunk-level later behind the same interface if line hunks prove too coarse.
