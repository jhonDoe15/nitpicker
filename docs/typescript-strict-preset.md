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
- Transforms use `map`, `filter`, `flatMap`, `Object.fromEntries`, and `Object.groupBy`. No loops,
  `forEach`, or `reduce`.
- No classes and no `this`. No recursion: a custom rule flags a function that calls itself.
- Expected failures are returned as discriminated unions, never thrown. TypeScript has no checked
  exceptions, so a result type is the only way the compiler forces every caller to handle a new
  failure case, which is the gate steering the author. It also keeps `domain/` pure. The cost is
  unwrapping at call sites and converting library exceptions at the adapter boundary.
- Illegal states are made unrepresentable with discriminated unions.

## Inside `adapters/`

- `for...of` is the only loop. No `forEach`, `for(;;)`, `for...in`, or `while`.
- `async`/`await` and `Promise.all`. No `.then()` chains, and no promise left without being
  awaited.
- Throw only for unexpected failures, using `Error` subclasses that preserve `cause`. Convert
  library exceptions into domain results at the boundary. No silent catches.
- Untrusted input is parsed once, at the boundary, with zod. Hand-written type guards for external
  data are not allowed.

## Everywhere

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
  the `domain` and `adapters` lists contain the `source` list plus their own selectors. Add a
  selector to the list of its scope; a test proves that a file under `features/x/domain/` gets both
  the global and the domain bans.
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

Rejected alternatives: whole-file promotion (a one-line edit in a large legacy file would force a
large cleanup and discourage small fixes); function-level promotion using symbols (more precise but
requires every analyzer to report symbol ranges, which they do not today). Function-level can replace
hunk-level later behind the same interface if line hunks prove too coarse.
