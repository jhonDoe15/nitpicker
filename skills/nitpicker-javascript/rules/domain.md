# domain/ is deeply readonly

Part of the [nitpicker-javascript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- `const` only, no loops, no mutation: use `map`, `filter`, `flatMap`, `reduce` with an initial
  value, `toSorted`. Text parsing (CSV lines, tokens) is domain logic too:
  `Array.from(line).reduce(step, initial)`; a value a schema can check (a date, a number) is
  checked by the schema in `adapters/`.
- Every parameter and result is typed readonly, callbacks included: `@param {readonly Invoice[]}`,
  `@returns {readonly Total[]}`, `@property`s marked `readonly`. A non-readonly type is a
  `prefer-immutable-types` finding, and so is a mutable module-level value. A local inside a
  function needs no annotation, but still isn't mutated: build a new `Set`, `Map` or `Date` instead
  of calling `add`, `set` or `setHours`.
- A callback that returns an object literal can't carry a type, so make it a module-level function
  with `@returns {Total}` and pass it: `statuses.map((status) => totalFor(xs, status))`. A reducer is
  the same: `xs.reduce(addInvoice, none)`, with `addInvoice` taking and returning the readonly type.
  Return readonly results as they are; don't spread-copy them.
- No module-level `RegExp` or zod schema (both are mutable): write the regex literal inside the
  function; schemas live in `adapters/`. Dedupe with `[...new Set(xs)]` or a `ReadonlySet`.
- A `Date` is mutable: use it in one expression (`new Date(ms).getUTCHours()`) or type it
  `Readonly<Date>`.
- In a server project, dates use UTC or a named zone, never the server's own: `getUTCHours()`,
  `toISOString()`, `Date.UTC(...)`, `{ timeZone }` for `Intl.DateTimeFormat` and `toLocale*String`,
  luxon `{ zone }`, date-fns `{ in: tz(zone) }`, dayjs `.utc()` (`nitpicker/no-local-time-zone`).
- Count by a union as `Readonly<Record<Status, number>>` written as a literal with every member,
  from one `Object.groupBy`, so a new member fails type-checking:
  ```js
  const byStatus = Object.groupBy(invoices, (invoice) => invoice.status);
  /** @type {Readonly<Record<Status, number>>} */
  const counts = {
    paid: byStatus.paid?.length ?? 0,
    open: byStatus.open?.length ?? 0,
    void: byStatus.void?.length ?? 0,
  };
  ```
  `Object.groupBy` needs `lib` `ES2024` (TypeScript 5.7 or later) for the type check. Group by key
  with `[...new Set(xs.map(key))]` and `filter`.
- Build a result that grows with the input in one pass (`Object.fromEntries`, `new Map`,
  `flatMap`, `Object.groupBy`), never by spreading the accumulator (`({ ...acc, [k]: v })`,
  `[...acc, x]`). The gate reads only inline `reduce` callbacks, so a reducer passed by name is a
  known gap, not a way around the rule: the same spread there is just as quadratic. Spreading a
  record of fixed keys (`({ ...acc, paid: acc.paid + 1 })`) does not grow and is fine.
- Variants of one union share one array type (`readonly Share[]` in each).
- `module.exports` assignment is not mutation and may stay; every other property assignment is.
