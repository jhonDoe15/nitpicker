# TypeScript strict preset

Status: decided, not implemented. Implement after the port is complete.

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
