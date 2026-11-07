# domain/ is deeply readonly

Part of the [nitpicker-typescript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- `const` only, no loops, no mutation: use `map`, `filter`, `flatMap`, `reduce` with an initial
  value, `toSorted`. Text parsing (CSV lines, tokens) is domain logic too:
  `Array.from(line).reduce(step, initial)`; a value a schema can check (a date, a number) is
  checked by the schema in `adapters/`.
- Parameters, return types and module-level values are readonly (`readonly Total[]`); a local
  inside a function needs no annotation, but still isn't mutated: build a new `Set`, `Map` or
  `Date` instead of calling `add`, `set` or `setHours`. Give a callback that returns an object or
  array literal a readonly return type. Return readonly results as they are; don't spread-copy
  them.
- No module-level `RegExp` or zod schema (both are mutable): write the regex literal inside the
  function; schemas live in `adapters/`. Dedupe with `[...new Set(xs)]` or a `ReadonlySet`.
- A `Date` is mutable: use it in one expression (`new Date(ms).getUTCHours()`) or type it
  `Readonly<Date>`.
- Count by a union as `Readonly<Record<Status, number>>` written as a literal with every member,
  from one `Object.groupBy` (`const byStatus = Object.groupBy(xs, (x) => x.status);` then
  `{ paid: byStatus.paid?.length ?? 0, ... }`), so a new member fails to compile. Group by key with
  `[...new Set(xs.map(key))]` and `filter`.
- Build a result that grows with the input in one pass (`Object.fromEntries`, `new Map`,
  `flatMap`, or `Object.groupBy`, which needs `lib` `ES2024` and TypeScript 5.7 or later),
  never by spreading the accumulator (`({ ...acc, [k]: v })`, `[...acc, x]`). The gate reads
  only inline `reduce` callbacks, so a reducer passed by name is a known gap, not a way around the
  rule: the same spread there is just as quadratic. Spreading a record of fixed keys
  (`({ ...acc, paid: acc.paid + 1 })`) does not grow and is fine.
- Variants of one union share one array type (`readonly Share[]` in each).
