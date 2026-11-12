# Types are JSDoc

Part of the [nitpicker-javascript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

JSDoc holds types only, never prose. Allowed tags: `@param`, `@property` (`@prop`), `@typedef`,
`@returns` (`@return`), `@type`, `@satisfies`, `@extends` (`@augments`), `@this`, `@callback`,
`@template`, `@import`, `@overload`. Anything else (`@throws`, `@private`, `@example`, a description
line) is a finding.

- Annotate every function: a `@param {Type} name` for each parameter and a `@returns {Type}`.
  Optional is `@param {string} [label]`.
- A named type is a `@typedef`, a string-literal union, never an enum:
  `@typedef {'paid' | 'open' | 'void'} Status`. An object type is
  `@typedef {{ readonly id: string; readonly cents: number }} Invoice`. Keep each line within 120
  characters: split a long union into named typedefs and join them
  (`@typedef {Parsed | Invalid | { readonly kind: 'malformed-json' }} ParseResult`).
- Bring a type in with `@import { Invoice } from '../domain/tally.js'`; there is no `import type`.
- A value whose type can't be inferred gets a one-line `/** @type {string[]} */` above its `const`.
  A literal that must stay narrow is `/** @type {const} */ ([...])`; that is the one allowed cast.
- No cast `/** @type {T} */ (value)`, the JSDoc `as`. Narrow with checks, parse with the project's validation library, or type the
  value correctly where it is made. There is no `!`.
- No `any`, `*` or a bare `?` in a type. No `null`, `?T` or `T?`: absent is `undefined`
  (`{ readonly note: string | undefined }`).
- No `unknown` in `@param` or `@property`, and none inside an object type or function parameter of
  `@returns`, `@type`, `@typedef`, `@satisfies` or `@this`. Parsing `unknown` input is `adapters/`
  work; it is not a domain type.
- No handwritten guard: no `@returns {x is T}` or `asserts`. Narrow with `kind` checks or a schema.
- `@satisfies {Type}` checks a value against a type without widening it.
