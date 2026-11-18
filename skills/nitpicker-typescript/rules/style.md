# Functions, types and expressions

Part of the [nitpicker-typescript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- `function` declarations for named functions, nested helpers too; arrows only as callbacks, with a block body when
  they return nothing: `(line) => { out.push(line); }`.
- `type`, never `interface`; string-literal unions, never `enum`; no classes except `Error`
  subclasses, what a framework requires (an instance method there that only forwards to a
  sibling method is reported) and, with NestJS, [its class forms](nestjs.md).
- No `as`, `any` or `!`, and no `null` in your own types or values: read a library's `null` with
  `regex.exec(s)?.[0]` in one expression or a strict `!== null` check. Narrow with checks, and
  don't add `??`, `?.` or checks the types already rule out. Indexing (`list[0]`, `record[key]`)
  may be `undefined`: check the value you got.
- `===` only. Early returns, no `else` after `return`, no nested ternaries, exhaustive `switch`
  over unions, with no `default`.
- No method that only passes its parameters, in order, to another method of the same class
  (`total(items) { return this.sum(items); }`): call that method directly (or, when it is less visible, rename it to the alias's name and delete the alias).
- A condition in its shortest exact form (`nitpicker/shorter-boolean-logic`): `n > 5`, not `n > 3 && n > 5`;
  `a`, not `(a && b) || (a && !b)`; `x >= 0 && x < 20`, not two adjacent ranges joined by `||`.
- Boolean logic in its simplest exact form (`nitpicker/simpler-boolean-logic`): `return a < b;`, not an `if`
  that returns `true` and `false`; one `if (a && b)`, not an `if` that only holds another `if`; `if (c) {B} else {A}`,
  not `if (!c) {A} else {B}` (and `c ? b : a`, not `!c ? a : b`); `a !== b`, not `!(a === b)`; `!(a || b)`,
  not `!a && !b`; a boolean `c` itself, not `c ? true : false` or `!!c`, and `c && x`, `c || x`, `!c && x`,
  `!c || x` for a ternary with one `true`/`false` branch and a boolean other branch.
- Template literals take strings only: `${String(count)}`.
- Sort IDs, codes and ISO dates with `toSorted()` and no comparator; names and titles with
  `a.localeCompare(b, 'en')`. Objects in plain string order share one `compareText(a, b)` that
  returns -1, 1 or 0 from `<` and `>`, with its own unit test (a sort reads only the sign). Chain
  keys on its result: `const byMonth = compareText(a.month, b.month); if (byMonth !== 0) return byMonth;`.
- `for...of` is the only loop, and no recursion: a retry is `for...of` over attempt numbers.
- Up to 3 parameters stay positional. Past 3, group related values into one object. A factory's
  inner functions count toward its 50 lines: put helpers at module level and pass `deps` in.
- Remove a parameter the body does not read. One that a callback or override signature requires
  starts with `_` (`_event`).
- Named exports only. No comments; a `/** ... */` doc comment on an export is the one exception.
- Signatures: an exported function or public method does not branch on a `boolean` parameter
  (`nitpicker/no-boolean-flag-parameter`): write two functions or take an options object or a union
  of string literals. A value with three states is a union of string literals, not `boolean | undefined`
  or `flag?: boolean` (also as an optional property); default only `undefined` with `??`, never `||` on an optional parameter that can be `0`, `''` or
  `false`; return a
  new array, `Set`, `Map` or object instead of changing a parameter (`[...items, item]`,
  `items.toSorted()`). When code moves, change every caller and delete the old name: no
  `@deprecated` declaration and no `export const Old = New` alias.
- A missing value is `undefined`, not falsy: test `count !== undefined`, `name !== undefined`, default with
  `value ?? fallback`, and filter with `(v) => v !== undefined`, never `if (count)`, `name || d` or
  `.filter(Boolean)` on a number, an optional string or an optional boolean (`nitpicker/strict-boolean-expressions`,
  `nitpicker/no-presence-truthiness`, the latter report-only). Once `if (x)` has decided `x`, do not write
  `Boolean(x)` or `!!x` in that branch (`nitpicker/no-decided-condition`).
- Text from an env var, a query parameter or a form field is checked for blankness before `Number(text)`:
  `Number("")` is 0, so `isNaN` alone accepts a blank value; use `if (!text?.trim())`, `Number.parseInt(text, 10)`,
  or a check that rejects 0 (`nitpicker/no-blank-number-coercion`).
- An "all done" or "all cancelled" signal over a list that can be empty checks the list first:
  `tools.length > 0 && tools.every(...)`, because `every` is true for no items
  (`nitpicker/no-empty-every-signal`, report-only).
- An explicit key and a spread of an object that can carry the same key are ordered on purpose: the explicit
  value goes last when it must win (`{ ...data, id: idOrSelector }`, `<Button {...props} disabled={loading} />`),
  and a caller default goes first or is read as `options.mode ?? 'detailed'` (`nitpicker/no-shadowed-spread-key`).
- An option read from an options or config object is defaulted with `??`, not `||`: `options.ipv6Subnet ?? 64`,
  `options.forceObject ?? config.forceObject`, so an explicit `false`, `0` or `''` from the caller stays
  (`nitpicker/no-falsy-default`).
- A cache or lookup decides presence from the key, not from the stored value: `if (!m.has(k)) { m.set(k, make()); }`
  then `m.get(k)!`, and `key in record` or `Object.hasOwn(record, key)` for a record of `unknown` values, because a
  cached `0`, `''`, `false` or `undefined` is a hit (`nitpicker/no-lookup-as-presence`).
- A key that can hold `undefined` is tested by its value, not by `in`: `data.targetUID !== undefined`, never
  `'targetUID' in data` on an optional property, a `Partial<...>` or a `Record<string, T | undefined>`
  (`nitpicker/no-in-presence-check`; `in` stays right for a union discriminant).
