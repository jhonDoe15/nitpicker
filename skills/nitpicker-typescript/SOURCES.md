# Sources and decisions

Why `--fix` applies what it applies for the TypeScript and JavaScript presets. The fixers live in
`languages/typescript/fix/`. Each decision below was made once, by reading what the rule or the
code fix does.

Three labels:

- safe: keeps the behaviour and gives the form the rule asks for. Applied by `--fix` with no rule
  selected.
- review: changes behaviour on purpose, or changes types. Applied only when `--fix` selects the
  rule, for example `--fix --rule eslint-lint/use-isnan`.
- left out: never applied. The reason is given.

## ESLint suggestions

`eslint --fix` applies only fixes. A rule that offers only suggestions, never a fix, needs another
step. nitpicker applies a suggestion when all of this holds: the rule is on the list below, the
message has exactly one suggestion, and the file is one you changed. A message with two or more
suggestions is left alone, because choosing between them is a decision for the author.

The preset enables these rules with suggestions and no fix (`meta.hasSuggestions` and no
`meta.fixable`).

| Rule                                                                                                                                                                                                                                                                                                     | Decision      | Why                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| `no-case-declarations`                                                                                                                                                                                                                                                                                   | safe          | wraps the case body in braces; scope only                                                                |
| `no-prototype-builtins`                                                                                                                                                                                                                                                                                  | safe          | calls `Object.prototype.hasOwnProperty` explicitly; same result                                          |
| `no-compare-neg-zero`                                                                                                                                                                                                                                                                                    | safe          | with `==` or `!=` the single suggestion keeps the comparison; with `===` it offers two and is left alone |
| `@typescript-eslint/no-unnecessary-type-constraint`                                                                                                                                                                                                                                                      | safe          | drops `extends any` or `extends unknown`; the type is the same                                           |
| `@typescript-eslint/no-useless-constructor`                                                                                                                                                                                                                                                              | safe          | removes a constructor that only forwards                                                                 |
| `@typescript-eslint/no-non-null-asserted-nullish-coalescing`                                                                                                                                                                                                                                             | safe          | removes a `!` the `??` makes pointless                                                                   |
| `@typescript-eslint/no-non-null-asserted-optional-chain`                                                                                                                                                                                                                                                 | review        | removing the `!` changes the type of the expression                                                      |
| `no-unused-private-class-members`                                                                                                                                                                                                                                                                        | review        | deletes a member                                                                                         |
| `use-isnan`                                                                                                                                                                                                                                                                                              | review        | `x === NaN` is always false; the fix changes the result                                                  |
| `preserve-caught-error`                                                                                                                                                                                                                                                                                  | review        | adds `{ cause: error }` to the thrown error                                                              |
| `@typescript-eslint/require-await`                                                                                                                                                                                                                                                                       | review        | removes `async`, so a throw becomes synchronous and the result is no longer a promise                    |
| `@typescript-eslint/await-thenable`                                                                                                                                                                                                                                                                      | review        | removes an `await`, which also removes a tick                                                            |
| `@typescript-eslint/ban-ts-comment`                                                                                                                                                                                                                                                                      | review        | turns `@ts-ignore` into `@ts-expect-error`, which fails when the error goes away                         |
| `@typescript-eslint/no-array-delete`                                                                                                                                                                                                                                                                     | review        | `delete items[i]` becomes `splice`, which shifts the array                                               |
| `@typescript-eslint/use-unknown-in-catch-callback-variable`                                                                                                                                                                                                                                              | review        | adds `: unknown`, which can break the callback body                                                      |
| `@typescript-eslint/switch-exhaustiveness-check`                                                                                                                                                                                                                                                         | review        | adds `case` branches that throw                                                                          |
| `no-empty`, `no-empty-static-block`                                                                                                                                                                                                                                                                      | left out      | the only suggestion adds a comment, and nitpicker never inserts comments                                 |
| `no-useless-escape`                                                                                                                                                                                                                                                                                      | left out      | always two suggestions (remove the backslash, or escape it)                                              |
| `no-nonoctal-decimal-escape`                                                                                                                                                                                                                                                                             | left out      | two suggestions                                                                                          |
| `no-misleading-character-class`                                                                                                                                                                                                                                                                          | left out      | adds the `u` flag, which can change what the pattern matches                                             |
| `valid-typeof`                                                                                                                                                                                                                                                                                           | left out      | no suggestion in the cases the rule reports                                                              |
| `array-callback-return`                                                                                                                                                                                                                                                                                  | left out      | suggestions depend on the callback; none is a single rewrite                                             |
| `@typescript-eslint/no-floating-promises`                                                                                                                                                                                                                                                                | left out      | two suggestions: `void` or `await`                                                                       |
| `@typescript-eslint/no-empty-object-type`                                                                                                                                                                                                                                                                | left out      | two suggestions: `object` or `unknown`                                                                   |
| `@typescript-eslint/no-unnecessary-type-conversion`                                                                                                                                                                                                                                                      | left out      | two suggestions: remove the call, or assert the type                                                     |
| `@typescript-eslint/no-unnecessary-condition`                                                                                                                                                                                                                                                            | left out      | the suggestions vary with the condition                                                                  |
| `@typescript-eslint/no-unnecessary-type-parameters`                                                                                                                                                                                                                                                      | left out      | a redesign of the signature, not a rewrite                                                               |
| `@typescript-eslint/no-unsafe-enum-comparison`                                                                                                                                                                                                                                                           | left out      | the suggestions pick a side                                                                              |
| `@typescript-eslint/no-misused-spread`                                                                                                                                                                                                                                                                   | left out      | the suggestions vary with the spread                                                                     |
| `regexp/no-contradiction-with-assertion`, `regexp/no-dupe-disjunctions`, `regexp/no-empty-alternative`, `regexp/no-escape-backspace`, `regexp/no-lazy-ends`, `regexp/no-misleading-capturing-group`, `regexp/no-useless-assertions`, `regexp/no-zero-quantifier`, `regexp/optimal-lookaround-quantifier` | left out      | a pattern rewrite needs the author's intent; several offer more than one suggestion                      |
| `react-dom/no-missing-button-type`                                                                                                                                                                                                                                                                       | left out      | the plugin offers `button`, `submit` and `reset`, and nitpicker removes the plugin's suggestions         |
| `jsx-a11y-x/interactive-supports-focus`                                                                                                                                                                                                                                                                  | left out      | two suggestions: `tabIndex` 0 or -1                                                                      |
| `nitpicker/strict-boolean-expressions`                                                                                                                                                                                                                                                                   | left out here | nitpicker's own rules offer their rewrites through their own suggestions                                 |

## TypeScript code fixes

The TypeScript language service offers code fixes for compiler errors. nitpicker calls
`getCodeFixesAtPosition` for the diagnostics of each changed file and applies a fix when the
service offers exactly one fix of the listed kind. Where two modules export a missing name, the
fix is left alone. A file with a syntax error is left alone. Passes repeat up to three times.

| Code fix                                                                                                    | Error codes                                                             | Decision | Why                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `fixOverrideModifier` (add)                                                                                 | TS4114, TS4115, TS4116                                                  | safe     | adds `override`; no runtime effect                                                                                            |
| `fixOverrideModifier` (remove)                                                                              | TS4112, TS4113                                                          | review   | removes `override` where the base class has no such member                                                                    |
| `import`                                                                                                    | TS2304, TS2552, TS2686                                                  | review   | adds an import; the module the service picks may not be the one meant                                                         |
| `unusedIdentifier` (remove)                                                                                 | TS6133, TS6192, TS6196, TS6198, TS6199, TS6205                          | review   | deletes the declaration with its initializer, and an import with its side effects. The prefix-with-underscore fix is not used |
| `addMissingAwait`                                                                                           | TS2322, TS2339, TS2345, TS2365, TS2769, TS2773, TS2774, TS2801, TS80007 | review   | adds an `await`, which changes the timing                                                                                     |
| `fixAwaitInSyncFunction`                                                                                    | TS1308                                                                  | review   | makes the function `async`, so it returns a promise                                                                           |
| `addMissingConst`                                                                                           | TS2304, TS18004                                                         | review   | declares the variable the code assigned without declaring                                                                     |
| `fixSpelling`, `inferFromUsage`, `fixMissingFunctionDeclaration`, `fixCannotFindModule` and the other fixes | any                                                                     | left out | a guess about intent, a new declaration or a package install                                                                  |

JavaScript projects use JSDoc-typed checking (`allowJs` and `checkJs`), so the same fixes apply
where the compiler reports the error.

## knip

`knip --fix --fix-type dependencies` removes unused dependencies from `package.json`. With
`--rule dead-code/exports` or `dead-code/types`, it also removes the `export` keyword of unused
exports and unused exported types. nitpicker runs it on a
temporary copy of the project with the same configuration the dead-code check uses, and writes back
only the edits to files you changed, through the engine's checked write. A changed `package.json`
keeps its indentation and line endings.

| Fix type           | Decision | Why                                                                                                      |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------- |
| `exports`, `types` | review   | removes only the `export` keyword; the declaration stays and can become unused, so only `--rule` runs it |
| `dependencies`     | safe     | removes a dependency nothing imports, when `package.json` is among the changed files                     |
| `files`            | opt-in   | deletes a file; runs only when `--fix --rule dead-code/files` selects it                                 |

knip is licensed ISC, which the license policy allows.

## Project recipes

Project recipes rewrite code across files with the TypeScript language service of the installed
`typescript` package (no ts-morph, no jscodeshift). They run only with `--fix --rule <tool/rule>`,
because each one changes a module path or a public name. Each recipe runs the rule's own check, so it
flags what the rule flags, and declines when the language service cannot show every reference.
After a plan, nitpicker applies it to a second in-memory copy of the project and refuses it when a
touched file gets more compiler errors, and so does any file that imports a touched file, directly or
through a re-export. A recipe also declines when a `package.json` entry (`main`, `module`, `types`,
`bin`, `exports`) names the moved module, when a `.vue`, `.svelte`, `.astro`, `.md` or `.mdx` file may
import it, or when a string names it, such as `vi.mock('./greet.js')`. `jsconfig.json` is read when
there is no `tsconfig.json`, and JavaScript projects are checked with `checkJs` for this comparison.

| Rule                                                           | Decision | What the recipe does, and when it declines                                                                                                                                                                              |
| -------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint/nitpicker/no-default-export`                           | review   | names the default export and rewrites default, renamed, namespace and `export { default as x }` importers. Declines for `import()` or `require()` of the module, a computed namespace key, or `export { default } from` |
| `eslint/nitpicker/file-name-casing`                            | review   | renames the file with `getEditsForFileRename`. Declines when the new name is taken, a string names the path, or a computed `import()` could load it                                                                     |
| `eslint/nitpicker/naming-convention`                           | review   | renames with `findRenameLocations`, keeping leading underscores. Declines when the new name collides (a new compiler error) or an exported name is read at run time. Messages other than the format one are left        |
| `eslint/nitpicker/no-compatibility-shim`                       | review   | deletes the alias export and renames its uses to the canonical name. Declines when an importer already imports the canonical name. `@deprecated` tags are left to the comment rules                                     |
| `eslint/nitpicker/no-test-helpers-in-source`                   | review   | moves the helper to `<test root>/test-support/<path>` (or `test-support/` beside it when tests are colocated). Declines when production code imports it                                                                 |
| `eslint/nitpicker/no-uncollected-tests`                        | review   | renames the file to `*.test.<ext>`. Declines when that name is taken                                                                                                                                                    |
| `eslint/nitpicker/no-external-executables-in-unit-tests`       | review   | moves `<root>/unit/...` to `<root>/integration/...`, and a source `__tests__` file to `<test root>/integration/...`                                                                                                     |
| `coupling/shared-used-by-one-feature`                          | review   | moves the module into the feature directory the rule names, under its own file name. Declines when a production importer sits outside that feature, or the name is taken                                                |
| `entry-points/public-alternative-bypass`                       | review   | imports from the entry point and adds the export there when it is missing. Declines a default import, a namespace import or an entry point that is not a module of the project                                          |
| `dependency-architecture/feature-internals-only-through-index` | review   | imports from the feature index and adds the export there when it is missing. Declines a default or namespace import, and leaves files inside the feature alone                                                          |
| `structure/duplicate-definition`                               | review   | keeps the exported copy (else the first), exports it if needed, and imports it in the other module, keeping the name exported there. Declines when the import would add a cycle                                         |
| `structure/exported-name-collision`                            | safe     | aliases one import with `as` to the next free name. Pure local renaming, so it is safe                                                                                                                                  |
| `eslint/nitpicker/no-forwarding-wrapper`                       | review   | points callers at the target and deletes the wrapper. Declines when the wrapper is exported and read at run time, or a caller cannot be rewritten                                                                       |
| `structure/unused-prop`                                        | review   | drops the property from the type and the destructuring. Declines when a caller passes it or a spread could                                                                                                              |
| `structure/unused-option`                                      | review   | drops the property from the type and the destructuring. Declines when a caller passes it or a spread could                                                                                                              |
| `dead-code/test-only-export`                                   | review   | moves the declaration to test support and repoints test imports. Dropping `export` when nothing imports it is left to the knip `dead-code/exports` fix                                                                  |
| `eslint/nitpicker/no-dev-dependency-in-production`             | review   | moves the package from `devDependencies` to `dependencies` with the same range and formatting. Declines when the manifest has no such entry The lockfile is not updated, so reinstall afterwards.                       |
| `dead-code/files`                                              | opt-in   | not a recipe: the knip step deletes the file (see knip), and keeps it when a computed `import()` or a string path could load it                                                                                         |

## Near-duplicate extraction

`typescript-extract-near-duplicate` is a safe recipe for `structure/near-duplicate`. It reads the
same units and runs the same engine and filters as the rule, so it flags what the rule flags, and
it works on a `same` or `parameterizable` pair whose copies are in one file. The first copy is the
template: its body moves to a module-level function placed after the first copy, and both bodies
become one call, so each signature stays.

- A differing literal, or a parameter of the function that nothing writes, is passed as a value.
  Any other differing expression is passed as an arrow function that is called where the
  expression was, so its timing, its count and its `this` do not change.
- A copy that reads `this`, `super`, `arguments`, a generator or JSX, or a variable of an enclosing
  scope, is left alone. So is a function with type parameters, defaults, rest or destructured
  parameters, a differing value that reads a local or a parameter the function writes, a differing
  module path in `import()` or `require()`, a copy whose second body has a comment the first lacks,
  a copy in more than one pair, and a name that the file already uses.
- Type holes are not turned into type parameters: the copies would need `new T()` or a type
  argument at each call, and the callers could change.
- The compiler checks the edit before it is written, with the same in-memory comparison as the
  other project recipes.

## Not fixed, on purpose

- `eslint/nitpicker/no-unsafe-deserialization`: the Python preset rewrites `yaml.unsafe_load` and
  `yaml.full_load` to `yaml.safe_load`. The TypeScript rule covers `node-serialize`-style packages,
  `v8.deserialize`, `vm` code runners, `js-yaml` full schemas, BSON function options and XML
  entities. Each needs a different library or a redesign of what the data may contain, so no single
  rewrite is safe and there is no recipe.
- `typescript-typecheck/TS6133` and the related codes: an unused variable whose initializer calls,
  constructs or awaits something is kept, and so is an unused parameter of an exported function or a
  public method, because removing either changes behaviour or the public signature.
- `dead-code/exports`, `dead-code/types`: only run with `--rule`, because the declaration stays
  after its `export` is removed.
