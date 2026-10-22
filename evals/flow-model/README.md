# Flow-model feasibility spike

Report-only evaluation code for issue #369. It extracts a deterministic flow model from one
TypeScript or JavaScript entry function, checks it against reviewed contracts, and compares the
result with an independent concrete oracle. Nothing here ships: `evals/` is outside the npm package
and outside the gate's source roots, no analyzer is registered or enabled, and no dependency was
added. It uses the `typescript` package already in `package.json` and Node built-ins only. No LLM
runs at any point.

## Layout

| Folder      | Contents                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------- |
| `extract/`  | TypeScript program (with `allowJs`), binding resolution, canonical model of statements   |
| `check/`    | Path-sensitive checker: facts, effect outcomes, contracts, bounds, partial reasons       |
| `oracle/`   | Transpiles and executes trusted sources with injected effects over finite inputs         |
| `report/`   | Canonical JSON, semantic hashes, cache keys, base/head diff, views, descriptive findings |
| `fixtures/` | Hand-labeled synthetic cases and their order contracts                                   |
| `real/`     | The reviewed protocol for `lookUpCachedReport` and its seeded and unsupported variants   |

`analyze.mjs` is the entry (`analyzeSource({ file, text, entry, contracts, inputs, bounds })`),
`evaluate.mjs` runs every evaluation, and `run.mjs` writes the artifacts.

## Supported subset

One entry function plus the same-file helpers it calls, transitively (function declarations and
top-level `const` arrow or function expressions). Bindings are resolved with the TypeScript checker
over a one-file program (`allowJs`, `noLib`, `noResolve`), so `.mjs` sources resolve the same way
as `.ts` sources.

- Statements: `const`/`let` declarations (including simple object destructuring), property
  assignment, expression statements, `if`/`else`, `return`, `throw`, `try`/`catch`, blocks.
- Expressions: string, number, boolean and `null` literals, `undefined`, parameters (including
  simple destructured parameters), locals, property and string-keyed element access, calls,
  `new`, `===`, `!==`, `&&`, `||`, `!`, conditional expressions, object literals with plain or
  shorthand properties, template literals. `await`, parentheses, `as`, `satisfies` and `!` are
  transparent.
- Literal guards: enum members and members of a top-level `const` object are inlined as literal
  values, keeping the source spelling (`OrderStatus.Pending`) for display.
- Calls are classified as same-file helper, import (original exported name, aliases resolved),
  global, member call on a value, or dynamic.

Everything else becomes an explicit `unsupported` node: loops, `finally`, `switch`, reassignment
of locals, spread, computed member calls, nested binding patterns, closures over outer function
bindings. Unsupported statements make the result partial. An unsupported expression that contains
a call is treated as an unknown call; one without a call (arithmetic, `??`, `typeof`) becomes an
unknown value, which keeps both branches of any guard on it feasible.

## The model

`extractModel` returns canonical JSON: `{ analyzer, file, entry, functions, missingHelpers }`. Each
function keeps its parameters and a statement tree; every statement, call and decision carries a
`loc` (line and column). Local bindings are identified by declaration order (`payOrder:id#2`), not
by position, so the model is stable under whitespace changes. `report/view.mjs` renders a decision
table and a path table from the same model and check result.

## Contracts

Contracts describe reviewed required behaviour and are kept apart from the extracted behaviour:

- `effects`: the modeled operations by name (`db.commit`, `cache.read`, an imported function), with
  the argument that identifies the entity and the finite outcomes (`success`, `failure`,
  `ambiguous`, optionally a returned literal or opaque value).
- `transitions`: allowed state transitions for an effect, where the current state comes from an
  argument field or from earlier modeled effects on the same entity.
- `prerequisites`: an effect requires an earlier successful effect on the same entity, for example
  `bus.publish('OrderPaid', A)` requires a successful `db.commit(A, 'paid')`. A commit for `B`, a
  commit of another state, a failed commit or an ambiguous commit does not satisfy it.
- `pure`: calls without effects (`Error` construction in the fixtures).

`inputs` declare finite domains (`{ oneOf: [...] }`), fixed values, opaque objects and effect
receivers. Entities are compared by their resolved value: literal ids, or the input path of an
object.

## Path semantics

- Paths are explored separately, true branch first; facts are never merged at joins, so a commit
  on one branch does not establish it on the other.
- Guards narrow facts on input fields and call results; a contradiction prunes the branch.
- Each modeled effect forks into its declared outcomes. `failure` throws and leaves the state
  unchanged; `ambiguous` throws and leaves the state as either the old or the new value, so it is
  never treated as a definite no-write. A caught failure continues as a failure path.
- An unknown call, an unknown dispatch, unsupported syntax, recursion, the call-depth bound or the
  state budget marks the result `partial` with the reason and location. Unknown calls also widen
  the facts they may touch (input fields and recorded entity states) and may return or throw.
  Violations found after any of these are reported as `possible`.
- A `partial` result is never a clean result, even when it reports no violation.

Each violation carries a witness: the ordered guards, catches and effect outcomes on its path,
each with a source location.

## Diff, hashes and cache keys

`report/diff.mjs` hashes each function model with locations removed, so a whitespace-only change
keeps the hash while the fresh model supplies refreshed locations. The cache key covers the analyzer
version, the entry, the semantic hash of every function in the entry's transitive same-file
closure, unresolved helper names, contracts, inputs and bounds. A change to a function outside the
closure keeps the key. `flowDiff` lists removed and added guards, effects, state writes and
completions with their locations, plus changed violations and path outcomes.

## Findings

`report/findings.mjs` emits only descriptive findings with existing fields (`tool`, `rule`, `path`,
`identity`, `symbol`, `message`, `classification`, `location`, `metric`). `run.mjs` passes every
finding through `parseAnalyzerReport` from `core/diff/comparison/finding-schema.mjs`. The model,
paths and witnesses stay in separate artifacts. Synthetic and seeded findings point to the
generated sources under `reports/flow-model/`, not to production files.

## Concrete oracle

The oracle does not use the extractor or the checker. It transpiles the trusted source with
`ts.transpileModule`, runs it in a `node:vm` context, and injects effect functions built from the
contracts (receiver methods and imported names). It enumerates every combination of the finite
input values and, by replaying choice prefixes, every sequence of effect outcomes; an ambiguous
outcome runs twice, once applied and once not. It checks the same contracts on the concrete event
trace and compares, in both directions, the set of violations and the set of traces
(`effect:outcome` sequence plus return or throw) with the static result. A call to an imported
name without a contract, or reaching the execution limit, counts as a disagreement. Only
`complete` static results are compared.

## Real operation: `lookUpCachedReport`

`core/diff/cache/findings-cache.mjs` (`lookUpCachedReport`), analyzed unchanged. Reviewed protocol:

- `resolveAnalyzerMetadata(analyzer, context)` resolves the version and configuration hash of
  `analyzer`. It may throw after updating only the version, so a throw is `ambiguous`, not a
  definite no-write.
- `cache.read(analyzer)` never throws (the findings cache catches its own failures) and returns
  `undefined` or one opaque report.
- `cache.read(A)` requires a successful `resolveAnalyzerMetadata(A)` earlier in the same
  invocation. Resolving another object does not satisfy it. This is a supplied protocol requirement,
  not one inferred from names; it says nothing about metadata resolved before the invocation.

Inputs: `analyzer` is an opaque object, `resolveContext` an object with a finite `strict` flag used
by one seeded variant, `cache` an effect receiver. Variants are produced by exact text edits that
must match once, so a change to the function makes the evaluation fail instead of silently
verifying something else. Seeded: omitted resolution, read before resolution, wrong object
resolved, continuing after a failed resolution, resolution on one branch only. Diff only: inverted
hit/miss guard, which is not a violation of this protocol and is shown by the flow diff. Unsupported:
unknown recovery call, aliased method dispatch, repeated reads in a loop.

## Measured results

Measured by `node evals/flow-model/run.mjs` on the source with SHA-256
`ccb5dd06727e04c4b60e9007b41e36e2a83d247bc6b7c6d66cde94e601cc28a5` (entry function
`8a6dc80a87eab72f72c8a13714f65e43261e343d1f63749fa7acbbffd6ef08ca`).

| Measure                                  | Synthetic fixtures | `lookUpCachedReport` variants |
| ---------------------------------------- | -----------------: | ----------------------------: |
| Targets                                  |                 30 |                            10 |
| Complete / partial                       |             23 / 7 |                         7 / 3 |
| Label mismatches                         |                  0 |                             0 |
| Distinct violations, definite (complete) |     12 in 11 cases |  5 in 5 seeded (5 of 5 found) |
| Distinct violations, possible (partial)  |       6 in 5 cases |                             0 |
| Oracle executions / compared targets     |           220 / 23 |                        58 / 7 |
| Oracle mismatches                        |                  0 |                             0 |
| Entry and helper source bytes            |              6,829 |                         3,090 |
| Canonical model bytes                    |             45,670 |                        17,581 |
| Decision and path view bytes             |             38,796 |                        11,570 |
| Full result bytes                        |             78,582 |                        18,186 |
| Modeled / unsupported statements         |            169 / 2 |                        50 / 1 |

The unchanged `lookUpCachedReport` is complete with three paths (unresolved, miss, hit) and no
finding within the supplied contract. Reviewed outcome of the findings: every definite violation is
a true positive confirmed by the oracle; there are no false positives among complete results; every
`possible` violation is uncertain by construction. These are synthetic or seeded cases, not
precision or recall on real code.

The model and the views are larger than the source they describe. This measures what the summary
retains; it is not a token or cost benchmark, and no token or cost savings are claimed.

## Limits

- One function and its same-file helpers; imported implementations are not analyzed, only
  contracted or reported as unknown.
- No loops, `finally`, `switch`, closures, reassignment, spread or arbitrary dispatch; they are
  partial. The engine does not type-check and does not model getters, proxies or aliasing between
  different input objects, which are assumed distinct.
- Calls are synchronous; `await` is transparent and concurrent mutation across awaits is outside
  the model.
- Unknown calls widen every mutable input fact rather than only the reachable ones.
- The prerequisite requires a matching effect inside the analyzed invocation; it does not establish
  the absence of earlier state.
- One real operation with one supplied contract. `writeStoredFile` in
  `core/diff/cache/cache-stores.mjs` still exists but is not covered here: it needs process globals
  and path identity that the oracle would have to compare by value.
- Cross-service composition is out of scope.

## Reproduce

```sh
node node_modules/vitest/vitest.mjs run --config vitest.config.mts evals/flow-model
node evals/flow-model/run.mjs
```

`run.mjs` prints the summary and regenerates `reports/flow-model/` (git-ignored): `summary.json`,
per-target models and results, `views.md`, `witnesses.md`, `diff.json`, `findings.json`, and the
generated fixture and variant sources the findings point to.

## Decision

Go for continuing as a report-only experiment; no-go for an enabled rule or a production analyzer.
Within the supported subset the extraction is repeatable, every result carries source anchors,
traversal is bounded and deterministic, and the static results agree with concrete execution on
every complete case. The evidence is one real operation with one supplied contract and synthetic
cases; it does not show precision on real code, and the model is larger than its source. The next
step is a second real operation with an independently established contract, recording first how
much of it this engine leaves partial, before adding syntax or proposing enforcement.
