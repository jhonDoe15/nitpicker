# Reuse after a move

Part of the [TypeScript strict preset guide](../typescript-strict-preset.md).

A move that leaves the old copy behind, or a second definition with a familiar name, is the most
common review comment on a large codebase, and `jscpd` (the `duplicates` check, 5 lines and 50
tokens at least) does not see small ones. These rules are reported by the `structure` check on
production files under the source roots; tests, declaration files, stories (`*.stories.*`,
`*.story.*`) and files under `__mocks__/`, `__fixtures__/`, `fixtures/` and `stories/` are left out.
Each message spells out the entry to add to `exceptions` in `nitpicker.config.json`; an exception
for a file takes that file out of the rule, so a pair of copies that must both stay needs one entry.

- `duplicate-definition`: two or more modules of one package define a top-level declaration with the
  same name and the same normalized text (whitespace, comments, quote style, semicolons and trailing
  commas ignored). It covers a function (declaration, `function` expression or arrow function:
  overload signatures, the type annotation of a `const`, parameters and body are compared), exported
  or private, and, only when exported, a `type` alias, an `interface` and a `const` whose
  initializer is only literals (numbers, strings, bigints, booleans, regular expressions, plain
  template literals, and arrays and objects of those, with or without `as const` or `satisfies`); a
  private `Props` type or `initialState` per module is normal. A `const` with any other initializer
  is not compared. Only definitions that are used are compared: another module imports them (by
  name, default, namespace or a dynamic `import()`, also through a workspace package), or the module
  references them, so framework conventions nothing imports (`export const dynamic`, `revalidate`, a
  route `GET`, a default `Loading` page) are skipped without a list of frameworks. A definition of 5
  lines and 50 tokens or more is left to the `duplicates` check. The text includes what each free
  name resolves to (the file or package it is imported from, the path from the importing file for an
  import that is not a source file such as `./styles.module.css`, or the text of the top-level
  declaration it names), so `count() { return db.size }` over two different `db` values is not a
  duplicate. Generated files (`*.generated.*`, `*.gen.*`, `*.pb.*`, `*_pb.*`, `__generated__/`,
  `generated/`) are skipped, and a monorepo compares within one package (the nearest `package.json`;
  without one, within one source root). Every copy is reported at its declaration and names the
  other files, once per name and file; the identity is the name and file, so existing copies are
  baselined. The message tells an exported copy to keep one definition and import it, a private copy
  to import the exported copy when there is one, and otherwise to move to one module and import it.
- `sibling-copy-edit`: a change edits a function or class so that it drifts from a copy with the
  same name and kind in another module of the package, and leaves that copy unedited. The two must
  be at least 80% the same tokens (twice the longest common token sequence over the tokens of both)
  both before and after the edit, and the edit must lower that figure: an edit that brings two
  copies closer, or that leaves them under 80% alike, is not reported. A pair that is identical
  before the edit counts as 100%; a pair that is identical after it is left to
  `duplicate-definition` and the `duplicates` check. It covers functions (declarations, function
  expressions and arrow-function `const`s) and classes of 20 tokens or more in parameters and body;
  types, interfaces, enums and constants are skipped, as are default exports and exported `GET`,
  `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` and `OPTIONS` handlers, whose name is the framework's and
  not a shared one (a route's `Page`, `Layout` or `GET`); ordinary names such as `handler` or
  `render` are compared. A copy is edited when its normalized text differs from the definition of
  the same name in the base (whitespace, comments, quote style and semicolons do not count), and
  untouched when it is equal; a copy with no base counterpart is new and left to
  `duplicate-definition`. A file that the diff reports as moved or renamed (the diff engine's own
  rename detection: at least 50% of the content kept, within git's rename limit of 20000 files) is
  read at its old path, so a moved copy counts as edited or untouched like any other; a rename that
  detection misses leaves the copy new. The token comparison stops as soon as 80% can no longer be
  reached, so large functions with scattered small edits are compared. A pair is skipped when what
  lies between its shared start and shared end is more than 20,000 tokens in the two together, or
  when it is large enough to be costly and its comparison passes a per-pair work cap or the run's work
  budget; a pair of up to about 2,000 tokens a side is always compared in full.
  Only the edited copy is reported, naming the untouched ones, so copies that are all edited, in the
  same way or differently, report nothing. Only the head snapshot reports it, as it reads the base
  checkout; the identity is the name and file. It covers the same files as `duplicate-definition`,
  and an exception for either copy's path lifts it. Edit the other copy too, or merge the two.
- `exported-name-collision`: two modules export different definitions under one name and a module
  imports both without aliasing both, so a reader and auto-import can mistake one for the other. A
  module that aliases every colliding import (`import { handler as getUser }`, `import type`,
  `export { x as y }`) is not reported. Both defining modules are reported. Re-exports
  (`export { x } from`, `export *`, an imported name exported again) resolve to the module that
  defines the name, so a feature's `index.ts` is not a second definition. That includes a default
  export re-exported under a name (`export { default as Button } from './button'`): two such
  `Button`s a module imports are two different exports and are reported. Imports resolve through relative paths,
  `tsconfig.json` `paths` and `baseUrl`, and a workspace package linked into `node_modules` resolves
  to its source; installed packages are skipped. Rename one, or alias both imports.
