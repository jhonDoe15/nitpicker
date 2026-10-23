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
| `fixtures/` | Hand-labeled synthetic cases, soundness regressions and their order contracts            |
| `real/`     | The reviewed protocol for `lookUpCachedReport` and its seeded and unsupported variants   |

`analyze.mjs` is the entry (`analyzeSource({ file, text, entry, contracts, inputs, bounds })`),
`evaluate.mjs` runs every evaluation, and `run.mjs` writes the artifacts.

## Supported subset

One entry function plus the same-file helpers it calls, transitively (function declarations and
top-level `const` arrow or function expressions). Bindings are resolved with the TypeScript checker
over a one-file program (`allowJs`, `noLib`, `noResolve`), so `.mjs` sources resolve the same way
as `.ts` sources.

- Statements: `const`/`let` declarations (including simple object destructuring), `=` assignment to
  a property, expression statements, `if`/`else`, `return`, `throw`, `try`/`catch`, blocks.
- Expressions: string, number and boolean literals, `undefined`, parameters (including simple
  destructured parameters), locals, property and string-keyed element access, calls, `new`, the
  comparisons `===`, `!==`, `==`, `!=`, `<`, `<=`, `>`, `>=`, `&&`, `||`, `!`, conditional
  expressions, object literals with plain or shorthand properties, template literals. Parentheses,
  `as`, `satisfies` and non-null `!` are transparent.
- Literal guards: enum members, top-level `const` literals and members of a top-level object
  declared `as const` are inlined as literal values, keeping the source spelling
  (`OrderStatus.Pending ("pending")`) for display and in the diff.
- Calls are classified as same-file helper, import (module specifier plus original exported name),
  global, member call on a value, or dynamic. Each call carries a site: the enclosing function, the
  callee text and its position among the calls of that callee (`payOrder:bus.publish#2`).

Everything else becomes an explicit `unsupported` node and makes the result partial: loops,
`finally`, `switch`, `await`, `async` and generator functions, optional chains and calls, `null`,
`typeof`, `instanceof`, `??`, arithmetic, spread, computed member calls, nested binding patterns,
closures over outer function bindings, module-level `let` or `var`, and every mutating form other
than a property `=` (local reassignment, `+=`, `||=`, `&&=`, `??=`, `++`, `--`, `delete`, and an
assignment used as an expression). A mutating node also widens all facts and replaces the locals and
parameters it writes with fresh unknown values. An unsupported expression that contains a call is
treated as an unknown call; one without a call becomes a fresh unknown value.

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
- `pure`: calls without effects that return an unknown value; `constructs`: constructors without
  effects (`new Error` in the fixtures). A `new` of anything else is an unknown call.
- Imported effects are keyed by module specifier and name (`./db#commit`); a same-named import from
  another module is an unknown call.

`inputs` declare finite domains (`{ oneOf: [...] }`), fixed values, opaque objects and effect
receivers. Entities are compared by their resolved value: literal ids, or the input path of an
object.

## Path semantics

- Paths are explored separately, true branch first; facts are never merged at joins, so a commit
  on one branch does not establish it on the other.
- Guards narrow facts on input fields and call results; a contradiction prunes the branch. A guard
  on a value with a declared finite domain enumerates the domain, so relational and loose
  comparisons stay complete there. A guard that forks on any other value (an undeclared field, an
  unconstrained parameter, two unknown values compared, an unknown call result) adds the reason
  `unknown-guard`. Two object values are equal only when they are the same input, object literal or
  opaque value. A property read on an unknown value may throw and adds `unknown-guard` too.
- Each modeled effect forks into its declared outcomes. `failure` throws and leaves the state
  unchanged; `ambiguous` throws and leaves the state as either the old or the new value, so it is
  never treated as a definite no-write. A caught failure continues as a failure path.
- An unknown call, an unknown dispatch, unsupported syntax, an unknown guard, an entity or a current
  state that cannot be identified, recursion (inlined up to the call-depth bound), the call-depth
  bound, an `async` function or the state budget marks the result `partial` with the reason and
  location. Unknown calls also widen the facts they may touch (input fields, object literals and
  recorded entity states) and may return or throw. Violations found after any of these are reported
  as `possible`; a transition from an unknown state is reported as a `possible` violation from `?`.
- A `partial` result is never a clean result, even when it reports no violation.

Each violation carries a witness: the ordered guards, catches and effect outcomes on its path,
each with a source location.

## Diff, hashes and cache keys

`report/diff.mjs` hashes each function model with locations removed, so a whitespace-only change
keeps the semantic hash and shows no changed function in the diff. The cache key covers the analyzer
version, the TypeScript version, the file, the entry, the semantic hash of every function in the
entry's transitive same-file closure, a hash of the same functions with their locations (so a cache
hit never serves stale line numbers), unresolved helper names, contracts, inputs and bounds. A change
to a function outside the closure keeps the key; a whitespace change inside it changes the key but
not the semantic hashes. `flowDiff` lists removed and added guards, effects, state writes and
completions with their locations, plus changed violations and path outcomes.

## Findings

`report/findings.mjs` emits only descriptive findings with existing fields (`tool`, `rule`, `path`,
`identity`, `symbol`, `message`, `classification`, `location`, `metric`). `run.mjs` passes every
finding through `parseAnalyzerReport` from `core/diff/comparison/finding-schema.mjs`. The model,
paths and witnesses stay in separate artifacts. A violation's identity includes its call site, so two
calls that break the same rule are two findings, and the identity survives whitespace changes. Synthetic and seeded findings point to the
generated sources under `reports/flow-model/`, not to production files.

## Concrete oracle

The oracle imports nothing from the extractor or the checker. It transpiles the trusted source with
`ts.transpileModule`, runs it in a `node:vm` context, and injects effect functions built from the
contracts (receiver methods and `module#name` imports). It enumerates every combination of the
finite input values and, by replaying choice prefixes, every sequence of effect outcomes; an
ambiguous outcome runs twice, once applied and once not. It checks the same contracts on the
concrete event trace.

It therefore checks the path enumeration (guards, outcomes, catches, entity identity) against the
same reading of the contracts. It does not check the contract rules themselves, whether a contract
describes the real dependency, or code that a contract replaces.

- A `complete` static result is compared exactly: the sets of violations and of traces
  (`effect:outcome` sequence plus return or throw) must be equal in both directions, and a call to
  an import without a contract or reaching the execution limit is a disagreement.
- A `partial` static result is compared as a subset: every concrete violation must appear among the
  static violations, definite or possible (an unknown entity `?` matches any entity). Imports
  without a contract may return `undefined` or throw. This only explores what the oracle can run: an
  unknown call never mutates its arguments, and a call to an undefined global always throws, so
  the subset check is weaker than the exact one.
- `async` and generator entries are not run and are reported as `unsupported`.

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

Measured by `node evals/flow-model/run.mjs`; `summary.json` records the SHA-256 of the analyzed
source and entry function.

| Measure                             | Synthetic fixtures | `lookUpCachedReport` variants |
| ----------------------------------- | -----------------: | ----------------------------: |
| Targets                             |                 41 |                            10 |
| Complete / partial                  |            27 / 14 |                         7 / 3 |
| Label mismatches                    |                  0 |                             0 |
| Violations by call site, definite   |     14 in 12 cases |  5 in 5 seeded (5 of 5 found) |
| Violations by call site, possible   |     15 in 12 cases |                             0 |
| Exact oracle: targets / executions  |           27 / 251 |                        7 / 58 |
| Subset oracle: targets / executions |           13 / 104 |                        3 / 28 |
| Oracle disagreements                |                  0 |                             0 |
| Not run by the oracle (`async`)     |                  1 |                             0 |
| Entry and helper source bytes       |              9,201 |                         3,090 |
| Canonical model bytes               |             67,959 |                        18,633 |
| Decision and path view bytes        |             55,766 |                        13,489 |
| Full result bytes                   |            116,915 |                        21,632 |
| Modeled / unsupported statements    |            230 / 6 |                        50 / 1 |

The unchanged `lookUpCachedReport` is complete with three paths (unresolved, miss, hit) and no
finding within the supplied contract. Reviewed outcome of the findings: every definite violation is
a true positive confirmed by the oracle; on these fixtures there are no false positives among
complete results; every `possible` violation is uncertain by construction. The complete cases use
declared finite domains for every value a guard forks on. These are synthetic or seeded cases, not
precision or recall on real code.

The model and the views are larger than the source they describe. This measures what the summary
retains; it is not a token or cost benchmark, and no token or cost savings are claimed.

## Limits

- One function and its same-file helpers; imported implementations are not analyzed, only
  contracted or reported as unknown.
- Everything listed as unsupported is partial, so most real code will be partial. The engine does
  not type-check and does not model getters, proxies or aliasing between different input objects,
  which are assumed distinct.
- Violations inside an unmodeled region (a loop body, a `finally` block, an unknown or async callee)
  are not reported; the result is partial, so no clean result is claimed for them.
- Unknown calls widen every mutable fact rather than only the reachable ones, and comparisons of two
  domain values are partial even when both domains are declared.
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
every complete case. That agreement covers only guards over declared finite domains; any other fork,
mutation, `async` code or unknown call makes the result partial, where the oracle can only check that
no observed violation is missing. The oracle shares the checker's reading of the contracts, so it
does not validate the contracts. The evidence is one real operation with one supplied contract and
synthetic cases; it does not show precision on real code, and the model is larger than its source.
The next step is a second real operation with an independently established contract, recording
first how much of it this engine leaves partial, before adding syntax or proposing enforcement.
