# Functions, types and expressions

Part of the [nitpicker-typescript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- `function` declarations for named functions, nested helpers too; arrows only as callbacks, with a block body when
  they return nothing: `(line) => { out.push(line); }`.
- `type`, never `interface`; string-literal unions, never `enum`; no classes except `Error`
  subclasses.
- No `as`, `any` or `!`, and no `null` in your own types or values: read a library's `null` with
  `regex.exec(s)?.[0]` in one expression or a strict `!== null` check. Narrow with checks, and
  don't add `??`, `?.` or checks the types already rule out. Indexing (`list[0]`, `record[key]`)
  may be `undefined`: check the value you got.
- `===` only. Early returns, no `else` after `return`, no nested ternaries, exhaustive `switch`
  over unions, with no `default`.
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
- Signatures: a value with three states is a union of string literals, not `boolean | undefined`
  or `flag?: boolean` (also as an optional property); default only `undefined` with `??`, never `||` on an optional parameter that can be `0`, `''` or
  `false`; return a
  new array, `Set`, `Map` or object instead of changing a parameter (`[...items, item]`,
  `items.toSorted()`). When code moves, change every caller and delete the old name: no
  `@deprecated` declaration and no `export const Old = New` alias.
