# Coding and architecture standards

`node languages/typescript/preset/coding-standards/check.mjs` checks production code and tests. Findings fail with
exit 1; parser, configuration, and analyzer failures fail with exit 2.

## Rules

- Preserve wrapped unclassified error causes and use Pino's structured `err` field.
- Use runtime narrowing instead of production `any` or type assertions.
- Inject internal collaborators instead of replacing production modules in tests.
- Advance fake clocks explicitly instead of polling with `waitFor`.
- Put external executable dependencies in integration tests.
- Keep runtime dependencies within the module's architectural role.
- Carry correlation input through asynchronous outcome callbacks; keep snapshot merging
  and external publication side effects out of source callbacks.
- Give public contract methods a production consumer. Tests alone do not justify an API.
- Strict set, `adapters/` (`languages/typescript/preset/eslint-config/strict-adapters.mjs`, files matching
  `src/main/features/*/adapters/**`): parse untrusted input with a zod schema. Zod is an
  expectation of the preset, not a dependency of nitpicker. `nitpicker/no-handwritten-boundary-guard`
  reports (1) any `x is T` or `asserts x is T` return type, since a hand-written guard is the
  banned form, and (2) a `JSON.parse(...)` call whose result is neither passed directly to
  `.parse`/`.safeParse`/`.parseAsync`/`.safeParseAsync` nor bound to a `const` that is later passed
  as an argument to one of them. It works on syntax only, so it cannot tell external data from
  internal data (every predicate is reported) and does not follow data through other functions or
  other sources such as `response.json()`.

Rules and synthetic fixtures use arbitrary names. Architecture assignments live separately
in `architecture/runtime-dependency-boundaries.config.mjs`; API callback roles live in
`callback-protocols/contracts.mjs`. Both default to empty; extend those assignments when adding
a module role or callback API. The analyzers discover production files rather than testing named
feature files.

## Existing debt

An optional `nitpicker.legacy.json` at the consumer project's root records pre-existing violations
at adoption (the `legacyInventory` key in `nitpicker.config.json` points elsewhere). A missing file means an empty inventory: every site fails. Coding identities include file, rule,
normalized source and occurrence count; public contract identities include file, contract and
method. A violation in another file, a changed site or an extra occurrence fails. Removed sites
must be removed from the inventory so their return fails too. Do not expand this inventory to
accept new code.

Build the adoption inventory from the intersection of violations in the original source and the
current source under the same rules, so fixes introduced during adoption are not grandfathered.
This gate and the differential gate are enforced on different bases: this gate blocks a fixed
baseline of legacy sites from growing; the differential gate blocks any _new_ enforceable finding
a branch introduces relative to its merge base. The snapshot dial reports every enforceable
finding present right now, with no baseline.

## Verification and limits

Run the policy tests after changing a detector or policy. Include bad and good synthetic examples
and run the actual standards gate. Behavioral bug regressions belong with the affected production
API; they are separate from these general rules.

Runtime boundary checks follow configured role patterns. Callback analysis resolves local
aliases/helpers but is not a cross-module call graph. Public-contract analysis follows
TypeScript declaration identity for exported interfaces implemented by production classes.
These checks complement review; they do not prove arbitrary architectural correctness.
Generated/build output is excluded.
