# Layout, size and dependencies

Part of the [nitpicker-typescript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- A feature is `src/main/features/<name>/` with an `index.ts`. Import another feature only through
  its `index.ts`, from `domain/` too: `import type { Tier } from '../../members/index.js'`. Never
  copy a type another feature exports: import it, or derive it from a function you call
  (`Parameters<typeof runGreeting>[1]`). Declare the types your task defines in your feature.
- Export only what another module imports; an exported type nobody imports fails dead-code.
  Callers in another feature derive result types: `Awaited<ReturnType<typeof importContacts>>`;
  inside a feature, extend the named type (`TransitionResult | { kind: 'blank-reason' }`).
- `adapters/` does I/O and parses untrusted input (files, HTTP bodies, JSON) once, with the project's
  validation library (zod if it has none; add it then). Field rules and conversions live in the schema
  (`z.string().trim().min(1)`, `z.email()`, `z.iso.date()`, `.transform(toCents)`), never
  `z.unknown()` fields plus hand checks. A JSON list is `z.array(recordSchema)`; the first issue's
  `path` (`[index, field]`) names the bad record.
- `domain/` is pure and takes parsed, typed values, never `unknown`. Decisions go here. No I/O or
  `process`; time, IDs and randomness are parameters. Code that drives injected async deps
  (retries, worker pools, abort) is `adapters/`; the decisions it needs are domain functions.
- `src/main/composition-root.ts` only passes things in, through named functions. A new feature is
  a new directory, never a new `if`, `?:` or `??` in a shared entry point: lookups and their
  missing-value checks go in the feature's `adapters/`.
- New code goes under the source roots (`layout.sourceRoots`); the gate reports anything outside.
- Follow neighbouring signatures (parameter order, naming) and reuse helpers that exist.
- A file stays within 300 lines (a test file 500) and a line within 120 characters. A folder holds
  at most 6 source files and 6 test files directly: group the rest into subfolders by what they do.
- A new clone of at least 5 lines and 50 tokens (`duplicate-clone`), in source or tests, fails:
  extract a function, also when the copy has other names and literals. A smaller production
  function proved to copy another (`near-duplicate`: the same tree apart from renamed locals, up to
  4 changed values, a shared run of 3 or more statements, or the same logic written another way, such as a loop and the call that replaces it) fails too: extract one function that
  takes the changed values as parameters.
- The gate fails unlisted, unused and unresolved dependencies, production imports of a
  `devDependency`, and committed secrets, binaries, build output and files over 1 MB; each message
  names the fix. Don't add an `exceptions` entry to get past one: stop and ask.
