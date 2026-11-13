# Layout, size and dependencies

Part of the [nitpicker-javascript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- A feature is `src/main/features/<name>/` with an `index.js` (`index.mjs` or `index.cjs` also
  work). Import another feature only through its index, from `domain/` too. Declare the types your
  task defines in your feature.
- A type another feature needs is a `@typedef` in its index; the importer uses `@import`:
  `/** @typedef {import('./domain/tally.js').Invoice} Invoice */` in `invoices/index.js`, then
  `/** @import { Invoice } from '../../invoices/index.js' */` in the other feature. Never copy a
  type: import it, or derive it from a function you call (`Parameters<typeof runGreeting>[1]`).
- `adapters/` does I/O and parses untrusted input (files, HTTP bodies, JSON) once, with the project's
  validation library (zod if it has none; add it then). Field rules and conversions live in the schema
  (`z.string().trim().min(1)`, `z.email()`, `z.iso.date()`, `.transform(toCents)`), never
  `z.unknown()` fields plus hand checks. A JSON list is `z.array(recordSchema)`; the issues'
  `path` (`[index, field]`) names the bad record: `issues.map((issue) => issue.path.join('.'))`.
  Parse a URL from runtime text with `URL.parse(text)` or after `URL.canParse(text)`; `new URL(text)`
  throws on text that is not a URL (`nitpicker/no-unhandled-url-parse`).
- Build an `Intl` formatter or an `Ajv` instance with fixed options once, at module scope or in a
  class field, not per call (`nitpicker/reusable-object-per-call`).
- Test an environment variable for a value, not only for `undefined`: `if (!process.env.API_URL)`,
  `process.env.PORT || '3000'`, or a schema with `z.string().min(1)`. `API_URL=` gives `''`, which passes
  `!== undefined`, `in` and `??` (`nitpicker/no-undefined-only-env-check`).
- `domain/` is pure and takes parsed, typed values, never `unknown`. Decisions go here. No I/O or
  `process`; time, IDs and randomness are parameters. Code that drives injected async deps
  (retries, worker pools, abort) is `adapters/`; the decisions it needs are domain functions.
- Regexes: don't reuse a `g` or `y` regex with `test()` or `exec()` across calls
  (`nitpicker/no-shared-stateful-regex`); use `includes` or `startsWith` instead of `match` or
  `search` with a string, and escape a parameter before building it into `new RegExp(...)`
  (`nitpicker/no-string-as-regex`).
  A pattern part that never changes the match or does not do what it looks like (an assertion that
  always accepts, a duplicate alternative, `[\w_]`, an empty group) is a `regexp/` finding: remove it
  or fix what was meant; a form with a shorter equivalent (`a{1}`, `(?:ab)c`, `[a]`) takes the
  shorter one.
- `src/main/composition-root.mjs` (or `main`/`server`) only passes things in, through named
  functions. A new feature is a new directory, never a new `if`, `?:` or `??` in a shared entry
  point: lookups and their missing-value checks go in the feature's `adapters/`.
- Print through a `@param {{ write(text: string): void }} out` parameter. Only the composition root
  (or a `layout.entryPoints` file) names `process.stdout` / `process.stderr` and passes them in;
  `console.*` is a finding everywhere.
- Shared code lives in `src/main/shared/` and does not import features.
- Export only what another module imports: an exported function or `@typedef` that nothing imports
  fails dead-code.
- Don't put `x.js` beside `x.ts` in one directory: TypeScript drops the `.js`. `.jsx` and `.tsx` are
  outside the preset, and so is React: a React project uses the typescript preset (`react` in
  `nitpicker.config.json` is an error here).
- The `$schema` line of `nitpicker.config.json`
  (`"$schema": "./node_modules/nitpicker/spec/config.schema.json"`)
  lets the editor flag a misspelled key or a value the run refuses; nitpicker ignores it. Keep it
  when you edit the file.
- Follow neighbouring signatures (parameter order, naming) and reuse helpers that exist. Match the
  module format of the files around you (ESM `import`/`export`, or CommonJS where the project is).
- A file stays within 300 lines (a test file 500) and a line within 120 characters. A folder holds
  at most 6 source files and 6 test files directly: group the rest into subfolders by what they do.
- A new clone of at least 5 lines and 50 tokens (`duplicate-clone`), in source or tests, fails:
  extract a function, also when the copy has other names and literals. A smaller production
  function proved to copy another (`near-duplicate`: the same tree apart from renamed locals, up to
  4 changed values, a shared run of 3 or more statements, or the same logic written another way, such as a loop and the call that replaces it) fails too: extract one function that
  takes the changed values as parameters. Two arms of an `if` chain, a ternary or a `switch` with
  the same body (`duplicate-branch`, renamed locals count as equal) fail: merge them, or change the
  arm that was meant to differ.
- The gate fails unlisted, unused and unresolved dependencies, production imports of a
  `devDependency`, and committed secrets, binaries, build output and files over 1 MB; each message
  names the fix. Don't add an `exceptions` entry to get past one: stop and ask.
