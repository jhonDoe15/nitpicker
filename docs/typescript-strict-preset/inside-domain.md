# Inside `domain/`

Part of the [TypeScript strict preset guide](../typescript-strict-preset.md).

- `const` only. No mutation: no `push`, property assignment, or `delete`. Parameters, return types,
  module-level values and data types are `readonly`. A variable inside a function needs no
  `readonly` annotation, because the mutation rules below report the ways to change it, and
  annotating every intermediate `map` or `filter` result only made agents write worse code.
- Transforms use `map`, `filter`, `flatMap`, `reduce` with an initial value (`xs.reduce((sum, x) =>
sum + x, 0)`), `Object.fromEntries`, and `Object.groupBy`. No loops, `forEach`, `reduce` without
  an initial value, or `reduceRight`.
- No classes and no `this`. No reassigning a parameter (`no-param-reassign`) and no changing one in place (`nitpicker/no-parameter-mutation`).
- No clock, randomness or I/O, however it is written: `Date.now`, `Math.random` and
  `performance.now` are reported as properties, so `const now = Date.now`, `const { random } =
Math` and `Math['random']()` are caught; `process`, `fetch`, `setTimeout`, `setInterval`,
  `setImmediate`, `queueMicrotask`, `performance`, `XMLHttpRequest`, `WebSocket`, `localStorage`
  and `sessionStorage` are restricted globals, also read through `globalThis`, `window`, `self`
  or `global` (`globalThis.fetch(url)`, `globalThis.Date.now()`); `Date()` without `new` reads the
  clock too; `dayjs` and `moment` are imported under their own names so `dayjs()` stays visible;
  `Reflect.set` and its mutating siblings are
  restricted like `Object.assign`.
- Expected failures are returned as discriminated unions, never thrown. TypeScript has no checked
  exceptions, so a result type is the only way the compiler forces every caller to handle a new
  failure case, which is the gate steering the author. It also keeps `domain/` pure. The cost is
  unwrapping at call sites and converting library exceptions at the adapter boundary.
- Illegal states are made unrepresentable with discriminated unions.
- `nitpicker/no-unknown-in-domain`: no `unknown` in a parameter or property type (including inside
  `readonly unknown[]`, `Record<string, unknown>` and index signatures). `domain/` receives values
  already parsed and typed; the schema that parses untrusted input (zod by default, otherwise the
  project's validation library) lives in `adapters/`, and `domain/` writes its own readonly type for
  the value. Do not write `z.infer<typeof schema>` or the library's equivalent in `domain/`:
  importing the schema type from `adapters/` breaks the layer rule, and a schema defined in `domain/`
  is itself mutable. The parsed output is assignable to the readonly type, so `adapters/` parses and
  passes the result in. An alias that is or contains `unknown`
  (`type Raw = unknown`, `type JsonObject = Readonly<Record<string, unknown>>`), also one imported
  from another file, is reported like `unknown`. `unknown` as a
  generic bound or default (`<T extends unknown>`, `<T = unknown>`), a return type, a variable or a
  `catch (error: unknown)` is not reported, and neither is a bare `cause: unknown` or `error: unknown`
  that carries a caught error through a failure result. An opaque value needs an exception in the
  config file.
  A hand-written guard such as `function isRecord(value: unknown): value is Record<...>` is
  reported once, by this rule, for its `unknown` parameter; `no-handwritten-boundary-guard` stays
  in `adapters/`.
- Mutation is reported once per site by the `no-restricted-syntax` domain selectors (`push` and the
  other mutating array methods, also through `.call`, `.apply` and `.bind`, property assignment and
  update, destructuring assignment, `delete`, `Object.assign`, `defineProperty`, `defineProperties`
  or `setPrototypeOf` on anything but a fresh object literal, and the mutating `Reflect` and
  `Atomics` calls). `nitpicker/no-mutating-method-in-domain` uses the types to report every other
  use of a mutating method of an array, `Set`, `Map`, `WeakSet`, `WeakMap`, `Date` (its `set`
  methods), typed array, `Buffer` or `URLSearchParams`: a computed `a['push']()`, a method taken as
  a value (`const add = set.add`, `xs.map(set.add, set)`), or a receiver typed `Readonly<Date>` or
  by a type parameter. Aliasing `Object` or `Reflect` itself is not followed.
  `functional/immutable-data` is not enabled because it reported the same sites a second time with
  a less helpful message.
- When `functional/prefer-immutable-types` flags something, its message names the annotation that
  fixes it: a callback that returns an object or array literal gets a return type
  (`items.map((item): Summary => ({ ... }))`, `lines.map((line): readonly string[] => ...)`); a
  module-level object literal gets a type with readonly fields; an `Object.groupBy` result is typed
  `Readonly<Partial<Record<Key, readonly T[]>>>`; an `Error` field is typed `unknown` (as `error` or
  `cause`) or replaced by `message: string`; a generic bound is written with readonly fields
  (`<T extends { readonly id: string }>`).
