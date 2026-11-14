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
