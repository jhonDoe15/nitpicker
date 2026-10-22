# TypeScript strict preset

Status: implemented (ticket S13). Strict is the only TypeScript preset; there is no lax rule set.
The "Decisions" section below records the owner-review decisions that S13 follows.

The preset allows one way to write each construct, and enforces it mechanically. Every banned form
fails with a message naming the allowed form. Strict is the TypeScript preset's only mode: it
replaces the current rules rather than sitting beside them as a separate preset. An exception exists
only in the nitpicker config file, where it changes the policy hash and appears in the report.
Existing code that violates a rule is baselined by the differential gate. New and touched code must
comply.

The rules are modeled on publicly described "one paved road" conventions, such as Lauren Tan's talks
on her Dune conventions: one allowed form per construct, repeated review feedback turned into lint
rules, mechanically enforced boundaries, and exceptions handled as reviewed changes. No code is
reused; those conventions aren't published as code.

The preset fixes the layout below, so the boundary rules can be generic. A `layout` override in the
config file is an exception like any other.

## Layout and boundaries

- Each feature lives in `src/main/features/<name>/` and exposes a public `index.ts`. Other code
  imports a feature only through that file. A new feature is a new directory, not a new branch in a
  shared entry point.
- `features/<name>/domain/` holds pure logic: functional core, imperative shell, using hexagonal
  architecture's folder names. It may not import `adapters/`, Node I/O modules (the pure ones
  `path`, `url`, `util`, `assert`, `buffer`, `events`, `string_decoder`, `punycode`, `querystring`
  and subpaths like `path/posix` and `assert/strict` are fine), network or database clients, the
  logger, module state, or ID and random-data libraries (`uuid`, `nanoid`, `cuid`, `ulid`, `faker`).
  Date libraries (`dayjs`, `luxon`, `date-fns`) are fine for arithmetic on a given value; reading
  the clock through them (`dayjs()`, `dayjs.utc()`, `moment()`, `DateTime.now()`, `Temporal.Now`,
  `.fromNow()`, and date-fns `isToday`, `isPast`, `startOfToday` or `formatDistanceToNow`) is reported
  like `Date.now()`.
  It may not reach Node I/O or a client through a `shared/` module it imports
  (`domain-does-not-reach-io-through-shared`; an `import type` does not count). Time, IDs, and randomness arrive as parameters. A
  dependency-cruiser rule that flags legitimate code is lifted with an `exceptions` entry that names
  the rule (for example `domain-does-not-import-node-io`), where `paths` are the importing files.
- `features/<name>/adapters/` performs I/O and calls `domain/`. A feature with neither I/O nor UI
  has no `adapters/` folder. React components and hooks live in `adapters/` (the UI is I/O with the
  user), or in `shared/ui/` when several features use them. `domain/` may not import a UI
  framework or UI state package: `react`, `react-*`, `*-react` (`lucide-react`), `@*/react` and
  `@*/react-*` (TanStack Query), `preact` and `@preact/*` (`@preact/signals`), `next` and `next/*`,
  `expo`, `expo-*` and `@expo/*`, `vue`, `svelte`, `solid-js`, `@angular/*`, `redux` and
  `@reduxjs/*`, `zustand`, `jotai`, `valtio`, `mobx`, `recoil`, `swr`, `motion` and
  `framer-motion`, `styled-components` and `@emotion/*`, the component kits (`@mui/*`,
  `@chakra-ui/*`, `@mantine/*`, `@radix-ui/*`, `@headlessui/*`, `antd`, `@ant-design/*`) and the
  icon packages (`@fortawesome/*`, `@iconify/*`, `@mdi/*`), also through `require`,
  `import = require` or a `shared/` module that imports or re-exports one. JSX is not written in
  `domain/` at all, even with the automatic runtime and no import: a component that renders the
  domain's result lives in `adapters/` or `shared/ui` (`nitpicker/no-ui-framework-in-domain`, so
  an exception lifts only this ban). The list is `uiFrameworks` in
  `architecture/domain-packages.mjs`, beside the network, database, logger and ID packages the
  dependency rules keep out of `domain/`.
- Shared code does not import features. Features do not import the composition root. Import cycles
  are not allowed.
- Code under `src/main/` lives in `features/`, `shared/` or the composition root
  (`nitpicker/no-unknown-main-folder`): a `services/`, `utils/` or `models/` folder there is
  reported on every file, with the layout in the message, and so is a file directly in `src/main/`
  other than the composition root and `index.ts` (`src/main/helpers.ts`). Inside
  `features/<name>/` only `domain/`, `adapters/` and the public `index.ts` are allowed
  (`features/auth/services/` and `features/auth/helpers.ts` are reported). Put the code in the
  feature that uses it (`domain/` for pure logic, `adapters/` for I/O) or in `shared/` when several
  features need it. A React project may also have UI folders directly under `src/main/` (`ui/`,
  `components/`, `pages/`, `app/`, `routes/`, `views/`, `layouts/`, `screens/`, `hooks/`, `styles/`,
  `assets/`) and `App.tsx`, and a `ui/` folder in a feature; any other folder, such as
  `src/main/services/`, is reported there too. The rule reports on line 1,
  so it is not strict: editing a legacy file in `utils/` does not fail, only a new file does.
- Objects are constructed only in the composition root. Dependencies are passed explicitly. No
  module-level `let`, and no module-level collection or object that the module mutates
  (`nitpicker/no-module-level-mutable-state`: `const cache = new Map()` with `cache.set(...)`,
  `const state = { count: 0 }` with `state.count++` or `state.items.push(x)`, a `Set`, `WeakMap`,
  typed array or `Object.create(null)` that is written to, an array with `push`, and
  `Object.assign`, `Object.defineProperty` or `Reflect.set` onto it, also through a `const`
  alias such as `const registry = cache`). An exported `Map`, `Set`, `WeakMap`, `WeakSet`, typed
  array or `Object.create(null)` is reported where it is declared, since another module can
  mutate it, unless it is annotated with a readonly type (`ReadonlySet<T>`, `ReadonlyMap<K, V>`,
  `readonly number[]`). Build a lookup table inside a
  function and return it; create a store in the composition root and pass it in. `domain/` is
  covered by `functional/prefer-immutable-types` instead.
- The composition root is `src/main/composition-root.ts`, `src/main/main.ts`,
  `src/main/server.ts`, `src/main.ts`, `src/server.ts` or `src/composition-root.ts` (any
  TypeScript or JavaScript extension) or a file under `src/main/composition-root/`. A `server.ts`
  or `main.ts` in another folder is not a root. The `compositionRootPattern` option
  adds roots to this list.
- `nitpicker/no-managed-resource-construction-outside-composition-roots` reports `new` on names
  that end in `Service`, `Client`, `Pool`, `Cache`, `Store`, `Scheduler`, `Transport`, `Adapter`,
  `Server`, `Worker`, `Connection`, `Queue`, `Producer`, `Consumer`, `Broker`, `Gateway`, `Database`
  or `Emitter`, on `Redis`, `Stripe`, `Octokit`, `OpenAI`, `Socket` and `WebSocket`, and the factory
  calls `createServer`, `createClient`, `createPool`, `createConnection`, `createWorker` and
  `axios.create`. Value types (`Map`, `Set`, `URL`, `Date`, `Error`, `RegExp`, `*Request`,
  `*Response`, `*Command`) are fine anywhere.
- `nitpicker/no-process-access-outside-composition-root`: environment variables (`process.env`,
  `import.meta.env`, `Deno.env`) are read only in the composition root, parsed once with a zod
  schema, and the typed config is passed down. `process.exit` is called only in the composition
  root or a main guard. However `process` is reached, it counts: `import { env }` from
  `node:process`, a namespace, default or `require` import, `const { env, exit } = process`, a
  `const` alias and `globalThis.process`. Entry scripts listed in `layout.entryPoints` and config
  files (`*.config.*`, `.*rc.*`) are exempt. In a React project `import.meta.env` is allowed
  anywhere: Vite replaces it with public build-time values (`import.meta.env.DEV`, `VITE_*`). So
  are `process.env.NODE_ENV`, `process.env.NEXT_PUBLIC_*`, `process.env.EXPO_PUBLIC_*` and
  `process.env.REACT_APP_*` written exactly that way, which Next.js, Expo and Create React App
  replace the same way.
- `shared-used-by-one-feature` (the `coupling` check): `src/main/shared/` holds code that two or
  more features use. A production module there that exactly one feature reaches, directly or through
  other shared modules only, and that nothing else imports, is reported on the module with the
  feature's folder to move it to. Type-only imports count as use, and so does an import through a
  workspace package linked into `node_modules`. The composition root, any other production module
  (`main.ts`, a module of another source root) and a second feature each count as another consumer;
  test files, stories (`*.stories.*`, `*.story.*`) and files under `__mocks__/`, `__fixtures__/`,
  `fixtures/` and `stories/` do not, and are not reported. A module no feature reaches is left to
  the dead-code check. The feature and shared folders are the ones the architecture rules use
  (`architecture/strict-layout.mjs`), under every `layout.sourceRoots` entry; a feature of another
  source root is another feature. A module that is shared on purpose before a second feature uses it
  needs an exception for this rule in `nitpicker.config.json`.
- `nitpicker/no-branch-in-composition-root`: the composition root (`composition-root.ts`, `main.ts`,
  `server.ts`, plus the `compositionRootPattern` option shared with
  `no-managed-resource-construction-outside-composition-roots`) only wires features with named
  functions that pass things in. It reports `if`, `?:`, `switch`, `??`, optional chaining (`?.`),
  loops, and `||` with a literal, object, array or call on its right (`env['PORT'] || 3000`, the
  `??` swap), inside functions and at module level, except the main guard (an `if` whose condition
  uses `import.meta` or `require.main`, as for `no-process-globals-outside-main-guard`) and
  branches in its condition, and a guard that only throws (an `if` with no `else` whose body is a
  single `throw`): `if (container === null) { throw new Error('#root is missing'); }` before
  `createRoot(container)` is how the entry file checks its mount node. `&&` and `||` between plain values, and `try`/`catch`, are not
  reported. A lookup or missing-value
  check moves into the feature's `adapters/` (or `domain/`). Existing branches are baselined, and a
  function that gains one fails; a branch that belongs in the root needs an exception for this
  rule in `nitpicker.config.json`.

## Inside `domain/`

- `const` only. No mutation: no `push`, property assignment, or `delete`. Parameters, return types,
  module-level values and data types are `readonly`. A variable inside a function needs no
  `readonly` annotation, because the mutation rules below report the ways to change it, and
  annotating every intermediate `map` or `filter` result only made agents write worse code.
- Transforms use `map`, `filter`, `flatMap`, `reduce` with an initial value (`xs.reduce((sum, x) =>
sum + x, 0)`), `Object.fromEntries`, and `Object.groupBy`. No loops, `forEach`, `reduce` without
  an initial value, or `reduceRight`.
- No classes and no `this`. No reassigning a parameter (`no-param-reassign`).
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

## Inside `adapters/`

- Throw only for unexpected failures, using `Error` subclasses that preserve `cause`. Convert
  library exceptions into domain results at the boundary. `nitpicker/preserve-error-cause` checks
  `Error` and every class whose name ends in `Error`: one thrown in a `catch` is reported unless
  it passes `{ cause: error }` as an option or the caught value itself as an argument (also inside
  an array, as in `new AggregateError([error, closeError], message)`, or through a
  `const cause = error`), whether or not it mentions the caught value (`throw new AppError('range')` and
  `new AppError(String(error))` are both reported).
- `nitpicker/no-silent-catch`: a `catch` must hand the failure on. It passes when it uses the
  caught value (rethrow an `Error` subclass with `{ cause: error }`, log it, or return it in a
  result) or when it returns a failure result object (`catch { return { kind: 'malformed-json' } }`).
  Carry the caught value only where something reads it; a field added just so the binding is read
  is slop. A `catch` that falls through, or returns a non-object such as `undefined` or `[]`, is
  reported. A deliberately dropped error needs an exception in the config file.
- `nitpicker/no-dev-dependency-in-production` (all production code): a value import (`import`,
  `export ... from`, `import()`, `require`) of a package that package.json lists only under
  `devDependencies` is reported. Move the package to `dependencies` (zod included). Type-only imports
  are not reported. An app a bundler builds (a bundler config or `build` script, and no `main`,
  `module`, `exports` or `bin` in package.json) and test support files (`setupTests.*`,
  `test-utils`, `testing/`, `__mocks__/`, stories) are skipped. The nearest package.json that lists
  dependencies is used; one that is not a JSON object is reported. Unlisted packages and unused dependencies are reported by the
  `dead-code` analyzer, see [Dependency and repository checks](usage.md#dependency-and-repository-checks).
- `nitpicker/no-unvalidated-schema-field` (all production code): no `z.unknown()` or `z.any()`
  (also with `.optional()`, `.nullable()`, `.default()` and similar wrappers, `z.optional(...)`,
  `z.nullable(...)`, `z.nullish(...)` and `z.readonly(...)`) as a field of `z.object`,
  `z.strictObject` or `z.looseObject`, or of a shape passed to `.extend`, `.safeExtend` or
  `.augment`. A schema that only checks the shape hands the
  field on unchecked, and `domain/` then re-validates it by hand. Validate the field in the schema
  (`z.string().trim().min(1)`, `z.email()`). `z.array(z.unknown())` or `z.unknown()` as a whole
  schema, and `z.unknown().refine(...)`/`.pipe(...)`, are not reported. The check looks through
  `z.record`, `z.array`, `z.set`, `z.map` and `z.tuple` elements and `.array()`
  (`z.record(z.string(), z.unknown())` and `z.unknown().array()` as a field are reported) and through a same-file `const` (`const anything = z.any()`). `z.custom<T>()`
  without a check function is a cast, and `z.looseObject()`, `.loose()`, `.passthrough()` and
  `.catchall(z.unknown())` let unknown keys through: use `z.object({...})` or
  `z.strictObject({...})`.
- Untrusted input is parsed once, at the boundary, with a schema library (zod by default). Hand-written
  type guards for external data are not allowed (`nitpicker/no-handwritten-boundary-guard`, in `adapters/`, `shared/` and
  the other layers outside `domain/`): a predicate whose parameter is `unknown`, `any`, `object`,
  `{}` or `Record<string, unknown>`, an `unknown` value narrowed inline with `typeof x ===
'object'` or `'key' in x`, and an overload whose implementation returns `unknown` or `any`. A
  predicate over a union (`(result): result is Ok => result.kind === 'ok'`) is fine, and so is
  `error instanceof Error` (or another class named `...Error` or `...Exception`, such as
  `z.ZodError`) on a caught value, including the checks it narrows: later in the same `&&` chain,
  inside the `if` or `?:` it guards, or after an earlier `if (!(error instanceof Error))` exit
  (`error instanceof Error && 'code' in error`). `instanceof Object` or any other class does not
  count as a guard.
  `JSON.parse(JSON.stringify(value))` as a copy is reported: use `structuredClone(value)`.

### Libraries follow the project

The rules keep their reason (validate at the boundary, keep the caught error on the log call) and
only the library follows the project. Nitpicker reads `dependencies`, `peerDependencies`,
`optionalDependencies` and `devDependencies` (presence, not a vote over files).

- **Where it reads.** The head policy carries the libraries of the head checkout:
  `libraries: { validation, logger, packages }`, where `validation` and `logger` come from the root
  `package.json` and `packages` maps each project-relative directory with a `package.json` (`.` for
  the root; `node_modules` and excluded folders are skipped) to the libraries it declares. A base
  run with its own `nitpicker.config.json` still takes the head's libraries, like the other facts of
  the head checkout, so base and head are checked against the same libraries, and the policy hash
  and cache key include them. The rules that report per file (the boundary guard, `unknown` in
  `domain/`, catch logging) pick, from `packages`, the entry of the directory nearest the file and
  every one above it up to the project root, so a monorepo package that declares valibot is
  checked against valibot; they read no `package.json` while linting. Within the list
  `dependencies` come before `devDependencies`, nearest package first; the first entry names the
  library in messages. The static `as`, `any` and JSDoc-cast messages read the root list only, so
  they name the root's library.
- **Validation library.** Recognised: zod, valibot, yup, joi (and `@hapi/joi`), io-ts, arktype,
  class-validator (with class-transformer), ajv, typebox, superstruct, runtypes, typia, effect
  (`effect`, `@effect/schema`) and valita. With none found the preset names zod.
  `nitpicker/no-handwritten-boundary-guard` accepts a parse of any detected library, matched by
  receiver and method. Calls on a schema built from the library (a value whose chain starts at an
  import or `require` of it) count for the library's parse methods: zod `parse`/`safeParse` and
  the async forms, yup `validate`/`validateSync`/`isValid` and the `At` forms, joi `validate`/
  `validateAsync`, io-ts `decode`, arktype `assert` and calling the schema, ajv `validate` and
  calling a function from `compile`, typebox `Decode`/`Parse` on a compiled type, runtypes `check`/
  `parse`/`assert`/`guard`/`validate`, valita `parse`/`try`. Functions of the library namespace or
  named import count too: valibot `parse`/`safeParse`/`assert`/`is` and `parser(schema)(data)`,
  `Joi.attempt`/`Joi.assert`, typebox `Value.Parse`/`Decode`/`Assert`, superstruct `create`/
  `assert`/`validate`/`mask`/`is`, typia `assert`/`is`/`validate`, effect
  `Schema.decodeUnknownSync(schema)(data)` and the other `decode` forms, class-validator
  `validate`/`validateSync`/`validateOrReject` (with `plainToInstance` in between). The forms
  `const { parse } = schema`, `schema['parse']`, `schema.parse.bind(schema)`, `pipe(data, codec.decode)`,
  casts (`as`, `!`) and `await` around the `JSON.parse` call are followed.
  A receiver the file cannot resolve (imported from your own module, a parameter, `this.schema`,
  a class field) counts for those same methods when type information shows a type declared by the
  library, or, without it, when its text matches `schema`, `codec`, `validat`, `type`, `ajv`,
  `struct` or `parser`. Other calls with the same names (`console.assert`, `form.validate`,
  `Value.Check`, yup `cast`) do not count. The guard and `unknown` messages are grammatical
  per library ("an io-ts codec", "an ajv schema") and the guard messages say how to add an
  exception. `nitpicker/no-unvalidated-schema-field` only looks at zod schemas, so it stays silent
  without zod.
- **Logger.** `nitpicker/structured-catch-logging` is never turned off; it checks the shape each
  detected logger reads. pino, nestjs-pino, pino-http and bunyan take the caught value as
  `logger.<level>({ err: error, ...context }, message)`. winston, log4js, loglevel, consola, tslog,
  roarr and signale take the caught value itself, passed as an argument or as a field of an object
  argument (`logger.error('message', error)`, `logger.error('message', { error })`), not its
  `.message` or a template string. With several loggers any of their shapes passes; with none
  found the `err` shape applies. `nitpicker/no-production-console` and `no-silent-catch` apply to
  every logger.

## Everywhere

- `nitpicker/no-self-recursion`: no function that calls itself or refers to itself
  (`xs.flatMap(flatten)` inside `flatten`), and no functions of one file that call each other
  (`evens` and `odds`), in all production code (`domain/`, `adapters/`, the composition root and
  shared code), not in tests. A reference counts when it is called, constructed or passed to an
  array method (`map`, `flatMap`, `forEach`, `filter`, `reduce`, `sort` and the like); a
  component that renders itself in JSX, `setTimeout(poll)` and an event handler that removes
  itself are not reported. A call inside a callback counts as the enclosing function's call when
  the callback is an array-method callback or is passed to a call whose result is used
  (`await limit(() => crawl(link))`); a callback handed to a timer or an event registration
  (`setTimeout`, `on`, `addEventListener`, `subscribe` and the like) or to a call written as a bare
  statement is its own function. Allowed forms: a retry or poll
  is a `for...of` over attempt numbers with `await` inside the loop; a tree walk (directories, AST,
  JSON) is a `for...of` over a worklist that each step pushes the node's children onto
  (`for (const node of pending) { pending.push(...children) }`); flat data uses `map`, `filter`,
  `flatMap` or `Object.fromEntries`. `domain/` has no loops and no recursion, so a walk over a tree
  of unknown depth moves to `adapters/`, which passes `domain/` the flat result.
- `for...of` is the only loop, in all production code (not just `adapters/`). No `forEach`,
  `for(;;)`, `for...in`, `while`, or `do...while`. `domain/` is stricter and has no loops at all.
- `async`/`await` and `Promise.all`. No `.then()`, `.catch()` or `.finally()` chains, and no promise
  left without being awaited (`@typescript-eslint/no-floating-promises`). Deliberate
  fire-and-forget is written `void job();`, typescript-eslint's own form; `.then()` and `.catch()`
  do not count. `await Promise.allSettled(...)` with its result dropped hides every rejection, and
  `new Promise((resolve) => resolve(value))` wraps a value that `Promise.resolve(value)` or an
  async function returns directly.
- Shared read/modify/write operations across `await` are rejected (`require-atomic-updates`, ESLint
  10.9.1, `allowProperties: false`) in production and test code, including the JavaScript dialect:
  `state.total += await load()`, `total = total + (await load())` on a binding that closures or
  other calls share, `state.items = [...state.items, await load()]`, and a value read into a local
  before the `await` and written back after it. Await the new value into a local first and read
  and write the shared state in one step with no `await` between them, or serialize the whole
  operation (a lock, a queue). A value that only one call can observe (a local, an object the
  function creates) passes, and so does `state.items.push(await load())`, which mutates in place.
  The rule is a strict rule, so a violation on a line you touch is new even when the base has it.
  It is enabled explicitly in `eslint-lint` (`eslint.configs.recommended` and
  `strictTypeChecked` do not include it); Oxlint 1.87.0 has no native equivalent, so the existing
  JavaScript plugin bridge runs the ESLint rule, and the finding keeps the standard ESLint semantic
  identity. The message adds the failure mechanism and the allowed forms to ESLint's evidence, and a
  reviewed `exceptions` entry (`rule: "require-atomic-updates"`, `paths`, `reason`) is the route
  for state that is already serialized or confined to one task. Other immutability rules can
  independently reject mutation; this rule specifically identifies stale reads across suspension.
  The `allowProperties: true` option would disable the property check and is deliberately not the
  preset default.
  Limits of the upstream analysis, measured and not assumed: it does not follow `this`
  (`this.total += await load()` passes; the preset bans classes outside `Error` subclasses, so
  this mostly concerns tests, object-literal methods and framework classes), a local alias of a
  shared object escapes detection (`const alias = state; alias.total += await load()`), a
  parameter object is treated as shared, so `req.user = await verify(req.headers.token)` and
  `order.items = await load(order.id)` report although they write a different property than they
  read, and a lazy initialization (`cached ??= await load()`, or `if (cached === undefined) {
cached = await load(); }` on a module binding) reports because two calls can both initialize.
  Run over real code, the rule reported nothing: Nitpicker's own `.mjs` sources (1,808 files, 201
  of them with `await`), the TypeScript sources of `@stryker-mutator`, `zod`, `rxjs` and
  `typed-inject` (843 files, 157 with `await`) and the JavaScript of `vitest`, `vite`, `knip`,
  `execa`, `eslint` and `@stryker-mutator/core` (1,475 files, 209 with `await`). That sample says
  nothing about recall; the false-positive classes above come from probes written for them, not
  from that corpus.
- `===` and `!==` only (`eqeqeq`). Braces on every `if`, `else` and loop body (`curly`). One import
  statement per module (`no-duplicate-imports`; a separate `import type` is fine).
- Identifier casing (`nitpicker/naming-convention`, which wraps
  `@typescript-eslint/naming-convention`): types and type parameters in PascalCase; functions,
  variables and parameters in camelCase; constants may be UPPER_CASE; a leading underscore is
  allowed. A schema constant may be PascalCase when its initializer starts from a binding imported
  from `zod`, `valibot` or `yup`, under any name (`const Order = z.object(...)`, then
  `type Order = z.infer<typeof Order>`, or a bare `object({...})` imported from valibot), or from
  another schema constant (`const CreateOrder = Order.omit({ id: true })`), or from an imported
  PascalCase binding through a schema method such as `.extend`, `.omit`, `.pick` or `.array`
  (`const Event = BaseEvent.extend({...})`), and so may a parameter typed as a component
  (`ComponentType`, `FC`, `ElementType`) or named `*Component`. PascalCase functions and variables
  are allowed in a React project. When the project depends on a framework with file-based route
  handlers (`next`, `@sveltejs/kit`, `astro`, `@solidjs/start`), an exported function named
  `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE` or `OPTIONS` is allowed. Names a destructuring
  takes from external data are not checked.
- Exported production functions declare their return type
  (`@typescript-eslint/explicit-module-boundary-types`): `export function total(rows: readonly Row[]): number`;
  a React component returns `ReactElement`. A function typed by its variable
  (`export const handler: Handler = ...`) counts as typed. Tests and JavaScript files are exempt.
- No deprecated API (`@typescript-eslint/no-deprecated`, type-aware, from the `strictTypeChecked`
  set): a call, import or type that its declaration marks `@deprecated` (`new Buffer`, `url.parse`,
  `fs.exists`, a deprecated React type) is reported with the replacement the deprecation names.
  The check is the TypeScript counterpart of the Java preset's `javac/deprecation` and
  `javac/removal` lint. A deprecation without a replacement, or an API the project must keep
  calling, takes an exception for the rule in `nitpicker.config.json`.
- No magic numbers (`nitpicker/no-magic-numbers`, which wraps
  `@typescript-eslint/no-magic-numbers`): name the number with a module-level constant; any number
  in its initializer is allowed (`const SECONDS_PER_DAY = 24 * 60 * 60;`,
  `const RETRY_STATUSES = [429, 503] as const;`). `-1`, `0`, `1`, `2`, `10`, `100` and `1000`
  (so `Math.round(x * 100) / 100`), an HTTP status code in the status argument of a response or
  error call (the first argument of `status`, `sendStatus`, `code`, `writeHead` and a bare `error` or
  `fail`, the second of `text`, `json`, `body` and `html`, either of `redirect`, `throw` and a
  callee named `...Error` or `...Exception`: `res.status(404)`, `c.json(body, 201)`,
  `new HttpException('gone', 410)`), the digits of `toFixed(2)` and `toPrecision(3)`, default parameter values, array indexes, numeric literal types
  and object property values are allowed. `x % 7` is reported: name the divisor. Tests are exempt.
- Security: no `eval` (`no-eval`); no regular expression with nested or overlapping quantifiers
  that backtracks super-linearly (`regexp/no-super-linear-backtracking`, from `eslint-plugin-regexp`);
  no shell command built from a variable or template (`nitpicker/no-shell-string-command`: `exec`
  and `execSync`, also through `promisify(exec)`, take a string literal or a `const` holding one,
  otherwise `execFile(program, [args])`; `shell: true` is reported, also in a `const` options
  object or a spread of one, and so is `sh`, `bash`, `zsh` or `cmd` run through
  `spawn`/`execFile` with `-c` (`/c`) and a command that is not a string literal); no
  `Math.random` for ids
  or tokens (use `crypto.randomUUID()` or `crypto.randomInt()`, or take the value as a parameter);
  no `fs` call on a path built from a parameter after its first segment (`path.join`,
  `path.resolve`, a template literal `` `${dir}/${name}` `` or `+`, also inside
  `path.normalize`/`path.resolve`, through a `const` or `let` variable, or a call on a parameter
  such as `c.req.param('file')` or `req.query.name`) unless the function checks containment on
  the variable in an `if` that returns, throws, `continue`s or `break`s before the call, or wraps
  the call in the `if`'s passing branch (`nitpicker/no-unsafe-path-join`:
  `const full = path.resolve(base, name); if (!full.startsWith(base + path.sep)) return ...`, or
  `if (path.relative(base, full).startsWith('..')) throw ...`). The prefix must end in a
  separator (`base + path.sep`, `` `${base}/` ``, `'/srv/'`): `full.startsWith(base)` also
  accepts `/srv-other`. A parameter as the first segment is the base and is fine
  (`path.join(dir, 'package.json')`).
- Security sinks: SQL built from strings, weak hashes, disabled TLS checks, HTTP calls without a
  timeout and unsafe deserialization. All five apply to production code, not to test support files (`test-support/`, `mocks/`, `__mocks__/`,
  `__fixtures__/`, `fixtures/`, `stories/`, `.storybook/`, `*.stories.*`, `setupTests.*`); each message
  names the allowed form and the exception route. They follow `const` values, aliases
  (`import { createHash as digestOf }`, `const run = pool.query.bind(pool)`, `const { createHash } = crypto`),
  `require`, `require(x).default`, `import x = require(x)`, `await import(x)`, default and namespace
  imports, `enum` members, `readonly` class fields, and options objects held in a `const` or spread from one.
  - `nitpicker/no-sql-string-building`: SQL text made by `+`, a template literal, `concat`, `join`,
    `replace` or `util.format` with a runtime value in it. Text counts as SQL only with SQL context:
    it starts with an upper-case statement (`SELECT ... FROM`, `INSERT INTO`, `UPDATE ... SET`,
    `DELETE FROM`, `WITH x AS (`, DDL) or an upper-case clause (`WHERE id =`, `ORDER BY`, `LIMIT`),
    or it reaches a query call: one named like `query`, `execute`, `raw`, `run` or `prepare`, or a
    pg-promise method (`none`, `one`, `any`, `oneOrNone`, ...), where lower-case SQL and a fragment
    such as `where id = ` before a value count too. English text, errors, log lines and JSX text are
    not SQL. Query-builder sinks count any runtime value: knex `whereRaw`, `orderByRaw` and the other
    `*Raw` methods, `sql.raw`, `Sequelize.literal`; TypeORM `where`/`andWhere`/`having` on a query
    builder count a value after a comparison, and `orderBy`/`groupBy` any value that is not an alias
    prefix (`${alias}.created_at`). Allowed: bind parameters (`$1`, `?`, `:name`), the project's tagged
    template (`` sql`...` `` in drizzle-orm, kysely, postgres, `` prisma.$queryRaw`...` ``; the message
    names the one in `package.json`), placeholder lists built only from placeholders
    (`ids.map(() => '?').join(',')`, `rows.map(() => '(?, ?)').join(', ')`, `'?,'.repeat(n).slice(0, -1)`,
    `Array.from(ids, () => '?')`, `$${i + 1}`, `$${params.length + 1}`), the optional-filter builder
    (`conditions.push('name = ?')` joined with `' AND '`), a table or column from a fixed lookup
    (`COLUMNS[key]` into a `const` object of plain names, also in JavaScript and `Object.freeze`, or a
    `for (const table of TABLES)` loop over a `const` list), and values that cannot carry SQL:
    numbers, `Number(x)`, `ids.map(Number)`, `Math.*`, `.length`, `mysql.escape(x)`, and with type
    information a `number`, `number[]`, `boolean` or union of plain string literals (`table: 'users' | 'orders'`).
  - `nitpicker/no-weak-hash`: MD5, SHA-1, MD2/MD4 and RIPEMD-160 in `createHash`, `createSign`,
    `createVerify`, `crypto.hash`, `pbkdf2`, `hkdf`, WebCrypto `subtle.digest`, `sign` and `generateKey`, a
    call whose name says hash, digest or checksum (not a predicate such as `isWeakHash`), a `{ algorithm }`
    or `{ hashAlgorithm }` property, `crypto-js` `MD5`/`SHA1`/`algo.SHA1`, `@noble/hashes` and `hash-wasm`
    `md5`/`sha1`, and the md5 and sha1 packages. A string counts only when it is exactly an algorithm
    name (`'md5'`, `'SHA-1'`, `'RSA-SHA1'`), not a prefix such as `'md5-calculator'`. HMAC-SHA1
    (`createHmac('sha1')`, `HmacSHA1`, subtle `{ name: 'HMAC', hash: 'SHA-1' }`, TOTP options with
    `digits` or `period`) is allowed, since HMAC does not rest on collision resistance and TOTP and
    OAuth 1.0a fix it; HMAC-MD5 is reported with its own message. Allowed: `createHash('sha256')` or
    stronger, `createHmac('sha256', key)`, and `scrypt`, argon2 or bcrypt for passwords.
  - `nitpicker/no-disabled-tls-verification`: `rejectUnauthorized: false`, `strictSSL: false`,
    `sslValidate: false`, a `rejectUnauthorized` set from the environment or a condition
    (`process.env.NODE_ENV === 'production'`, `!isDev`), MongoDB `tlsAllowInvalidCertificates`,
    `tlsAllowInvalidHostnames` and `tlsInsecure`, `NODE_TLS_REJECT_UNAUTHORIZED` set to `0`
    (assignment, `env` object, the whole string, or shell text given to `exec`/`spawn`),
    `?sslmode=no-verify` and the MongoDB flags in a URL, a `checkServerIdentity` that returns nothing,
    `ignoreHTTPSErrors`, `acceptInsecureCerts`, and `--ignore-certificate-errors` (also Electron's
    `appendSwitch('ignore-certificate-errors')`) outside a blocklist or comparison. Not reported: a
    server's `requestCert: true, rejectUnauthorized: false` (optional client certificates checked
    through `socket.authorized`), `--ignore-certificate-errors-spki-list`, and the same words in help
    or warning text. Allowed: trust the CA with `ca: readFileSync(caPath)`, `tlsCAFile` or
    `NODE_EXTRA_CA_CERTS`, and pin a browser certificate with `--ignore-certificate-errors-spki-list`.
  - `nitpicker/require-http-timeout`: a `fetch` without a `signal` or `dispatcher`, `axios` (`get`,
    `post`, `request`, `create`) and `got` without `timeout` or `signal`, and `http`/`https`
    `request`/`get` without `timeout`, `signal` or `setTimeout` (also after a chained `.on()`, and with a
    named callback). A call whose options come from a parameter or a spread is not reported, options
    built in steps (`init.signal = ...`) count, and a client made by `axios.create({ timeout })` or
    `got.extend({ timeout })` covers its calls, as does an `axios.create()` instance whose every call
    passes its own timeout. A timeout set once for the project counts: `axios.defaults.timeout` with a
    non-zero value on the axios import or on the same instance, and undici
    `setGlobalDispatcher(new Agent({ headersTimeout, bodyTimeout }))`, in the same file or in any
    production module of the project. node-fetch 2's `timeout` option counts when the project's
    node-fetch is 2.x. `fetch(request)` passthrough (a service worker's `event.request`, an edge
    handler's `Request`), `data:` and `blob:` URLs and `new URL(path, import.meta.url)` are not
    reported, and `axios.getUri` sends nothing. `fetch` is not checked in browser projects (React,
    Preact, Vue, Svelte, Solid, Angular, read from `package.json`). Allowed:
    `fetch(url, { signal: AbortSignal.timeout(10_000) })`.
  - `nitpicker/no-unsafe-deserialization`: `node-serialize`, `funcster` and `cryo` (they rebuild
    functions, also through `import x = require(...)` and `import()`), `v8.deserialize` (and the
    `v8.deserialize(v8.serialize(x))` copy, whose allowed form is `structuredClone(x)`),
    `vm.runInNewContext`, `runInThisContext`, `new vm.Script` and `compileFunction` with text that is
    not a string literal, js-yaml `DEFAULT_FULL_SCHEMA` (imported, destructured or re-exported), js-yaml
    3 `load`/`loadAll` without a `schema` (the installed major is read from the project), BSON
    `evalFunctions: true` and libxmljs `noent: true`. Allowed: `JSON.parse` checked against a schema,
    `yaml.load(text)` with the default schema in js-yaml 4, and `yaml.safeLoad(text)` in js-yaml 3.
- Named exports list their names: no `export *`, which makes every internal export of a feature's
  `index.ts` public (`export { name } from './domain/x.js'`).
- Cognitive complexity of at most 15 per function, tests included (`nitpicker/cognitive-complexity`).
  Each `if`, ternary, `switch`, loop and `catch` costs 1 plus its nesting level; `else`, `else if`,
  labelled `break`/`continue` and each run of like `&&`/`||` cost 1. Unlike the published algorithm,
  every function, callbacks included, is scored on its own with nesting starting at 0, and code
  outside any function is not scored. A function that must stay complex gets an exception for the
  rule in `nitpicker.config.json`.
- Config files are exempt from the loop, `forEach` and promise-chain bans; `eqeqeq` still applies.
- `nitpicker/report-module-load-effects` also reports work done by a module-level `const`
  initialiser (`Date.now()`, `performance.now()`, `Math.random()`, `crypto.randomUUID()`, `fetch`,
  timers, a `...Sync` call from `fs`, `child_process`, `crypto` or `zlib` such as `readFileSync`
  (a project's own `buildTableSync()` is fine), any `process.*` call, `new Date()` with no
  argument, `new Worker`, `new WebSocket`) and any top-level `await`. Pure initialisers
  (`z.object(...)`, `new RegExp(...)`, `path.dirname(...)`) are fine. A main guard is not module
  load work: an `if` with no `else` runs its body only when the file is started as a script, so
  neither the `if` nor what it runs is reported, when its condition is exactly one of
  `import.meta.main`, `require.main === module`, or `import.meta.url` compared with
  `process.argv[1]`, `pathToFileURL(process.argv[1]).href`,
  `pathToFileURL(realpathSync(process.argv[1])).href` or `` `file://${process.argv[1]}` ``,
  optionally joined by `&&` with `process.argv[1]` or `process.argv[1] !== undefined`. The allowed
  form, which also holds when the script is started through a symlink, is:

  ```js
  if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
    await run();
  }
  ```

  `process`, `require`, `module` and `undefined` must be the globals (an import of `node:process`
  counts) and `pathToFileURL` and `realpathSync` the imports from `node:url` and `node:fs`, not a
  local binding of the same name. Any other condition, such as `import.meta.env.DEV`, a bare
  `import.meta.url`, a call or a comma expression inside the comparison, is still reported.

- `nitpicker/no-production-console` also reports `console['error']` and, outside the composition
  root, `process.stdout.write` and `process.stderr.write`.
- Named functions use the `function` keyword; arrow functions only as callbacks.
- `type`, never `interface`, except in a `declare module` or `declare global` augmentation, or at
  the top level of a global declaration file with no imports or exports (such as `ImportMetaEnv` in
  `vite-env.d.ts`), which can only merge interfaces. No `enum` (use unions of string literals) and
  no `namespace`.
- Classes only for `Error` subclasses.
- Named exports only; config files and `declare module` blocks (`declare module '*.svg'`) are
  exempt.
- Early returns; no `else` after a `return`; no nested ternaries.
- A `switch` over a discriminated union must handle every case.
- `nitpicker/exhaustive-union-predicate` (type-aware): no `||` chain of `===` (or `&&` chain of
  `!==`) that compares one plain reference (`kind`, `props.kind`) with some string or number
  literals of a union that has at least three members, when the chain is a predicate's value: an
  arrow body, a `return`, or a value stored in a variable or assigned (also inside `!`, another
  `&&`/`||` or a ternary branch). A chain used as the condition of an `if`, `while`, `for` or
  ternary is ordinary narrowing and is not reported, and neither is a call argument. Allowed forms: a `switch` over the union with no `default`, or a
  `Record<Union, boolean>` lookup, so adding a member fails to compile. A subset check such as
  `status === 'open' || status === 'pending'` on a project union of three or more members is the
  case this reports. The message names the union by its alias (`Kind`) when the value's declared type
  has one, also after the value was narrowed or when it is `Kind | undefined`; an inline union is
  reported as "the union". It is not reported when the union comes from a library (its alias, or the
  property it is read from, is declared in `node_modules` or the default library, including a local
  binding or destructured parameter that holds a library value), when the comparison is on a
  property of a union-typed object (`event.type === 'a' || event.type === 'b'`, which narrows a
  discriminated union), or inside a function whose return type is a type predicate (`kind is
'a' | 'b'`), which names the subset in its type. The type is read at the first comparison, so an
  earlier guard that already narrowed the union can shrink it below three members. Add an exception
  for the rule when a partial test is intended.
- `nitpicker/no-forwarding-wrapper` (type-aware): a module-level named function or `const` arrow
  whose body is one `return` (or an expression body) of a call that passes exactly its own
  parameters, in order, unchanged (`export const loadUser = (id: string) => fetchUser(id)`) is
  flagged when its parameter types and return type are identical to the callee's, so a wrapper that
  brands, narrows or widens a type passes. The callee must be a module-level binding or an import
  that the file could re-export or the caller could import directly. Not flagged: member callees
  (`repo.find(id)`, `Math.abs(x)`, `api.get(url)`), callees that are parameters or closure variables
  (injected dependencies), functions declared inside a component, factory or other function,
  overload implementations, type-predicate and `asserts` functions (on either side), parameters
  whose optional or rest form differs from the callee's (`b?: number` over `b: number | undefined`),
  methods, `async` and generator functions, functions with type
  parameters, calls with type arguments, optional calls, PascalCase names (components), functions
  without parameters, default, destructured or transformed parameters, and a `const` with a type
  annotation. A wrapper around a hook (`useUser(key)` over an imported `useQuery(key)`) is reported
  like any other when the callee is module-level. For an exported wrapper (an `export` declaration,
  `export default`, or an export list) the message gives the re-export under the exported name,
  `export { fetchUser as loadUser }` or `export { fetchUser as default }`; for a local one it says to
  call the callee directly and delete the wrapper.
- No `as`, `any`, or non-null assertions.
- `undefined` only for absent values. `null` only where a library or JSON requires it.
- No comments, except doc comments (`/** ... */`) on exported declarations and the members of
  exported types. They are allowed there, never required; the Java preset follows the same rule for
  Javadoc. Tool directives are allowed, except suppressions: ESLint's `noInlineConfig` blocks
  inline disables, and `@typescript-eslint/ban-ts-comment` bans `@ts-ignore`, `@ts-expect-error`
  (with or without a description) and `@ts-nocheck`. `noInlineConfig` alone does not cover
  TypeScript suppressions. A test that a type rejects a value asserts it with Vitest's
  `expectTypeOf(fn).parameter(0).not.toExtend<Value>()`, which counts as an assertion. Coverage and
  mutation ignore comments (`istanbul ignore`, `c8 ignore`, `v8 ignore`, `Stryker disable`) are
  suppressions too: `nitpicker/no-comments` reports them, and code that truly cannot be tested
  gets a reviewed exception for that rule in `nitpicker.config.json`. Even with that exception the
  comments never take effect: the coverage run strips `istanbul`/`c8`/`v8 ignore` hints before it
  measures, and a mutant a `Stryker disable` comment would hide is reported as an enforceable
  `mutation/mutant-ignored` finding that asks for the comment to go. Code that must stay out of
  mutation testing gets an `exceptions` entry for `mutant-ignored` with its paths instead.
- Test files get the suppression half of that rule: `noInlineConfig` is on, and `eslint-disable`,
  `@ts-*`, coverage and `Stryker` comments are reported. Ordinary comments stay allowed in tests.
- A doc comment has to say something the name does not. `nitpicker/no-comments` reports a doc
  comment on an exported declaration or exported type member whose description only restates the
  name: it splits the name into words (camelCase, PascalCase, snake_case, kebab-case, digits),
  drops stopwords (`the`, `a`, `of`, `get`, `returns`, `component`, `class`, `value`...), and reports when
  every remaining description word, with a crude `ing`/`ed`/`es`/`s` stem, is a word of the name
  (`/** Gets the user name. */ getUserName`, `/** The order id */ orderId`, `/** Button component */
Button`). `@param`, `@returns` and other tag lines are not part of the description. Write the
  unit, the limit, the edge case or the reason (`/** Price in cents, rounded down. */`). A
  description longer than 5 lines, tag lines, blank lines and code examples not counted (a fenced
  ` ``` ` or `~~~` block, or the body of an `@example` tag; a fence that is never closed counts as prose), is reported too; bullets and
  other prose count: keep the non-obvious point and move the rest into names and types. Both
  checks are skipped in the JavaScript preset's JSDoc mode, which already bans JSDoc prose, and a
  doc comment that is needed as written gets an exception for the rule.

## Reuse after a move

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

## Inside tests

These rules cover every file of the test layout area (`<testRoot>/**`, `*.test.*` and `*.spec.*`
next to sources, and `__tests__/`). They ban forms that make a suite slow or non-hermetic. Each one
came from nitpicker's own suite, where it cost CI minutes. "Per test" means code that runs in an
`it`/`test` callback or in `beforeEach`. That includes same-file functions those callbacks call, but
not functions imported from other modules.

The `duplicates` check scans test files too, but between two test files it reports only a clone
that defines a named function (a copied helper: keep one in a non-test file such as
`test/support/` and import it). Repeated expected values and assertions between tests are left
alone.

The `duplicates` check also runs jscpd over a copy of the sources where every name, string, number and
comment is the same token, with at least 100 tokens and 5 lines, so a copy-pasted function whose
locals and literals were renamed fails too (`duplicate-clone`, identity starting `renamed:`).
Imports and re-exports, `interface`, `type` and `enum` declarations, literal-only objects and
arrays, field declarations and JSX markup (tags, attributes, text and plain `{name}` holders) are
left out of that copy, and so are generated files, so test tables, import lists and components that
only share markup structure are not clones, and neither is code that only repeats one or two
statements (constructor mappers, enum `switch` tables); handlers and conditions inside the markup count. The
message names the same route as for any clone: add either file of the pair to `exclude`. Between two test files it points at a helper or a table-driven test.

Every runnable test imports production code at runtime
(`nitpicker/test-must-use-production-runtime`), directly or through a relative test helper that
does, such as a `renderWithProviders` in `test/support/` that imports the app. The rule follows one
hop, and type-only imports do not count.

- `nitpicker/no-git-repository-per-test`: no `git init` or `git clone` per test. This covers direct
  `child_process`/`execa` calls and same-file wrappers such as `git(root, ['init'])` or
  `run('git', ['init'])`. Build a template repository once in `beforeAll` and `cpSync` it per test.
- `nitpicker/hermetic-git-in-tests`: every git process a test-area file starts passes an `env`
  object, written in that file, that sets `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_NOSYSTEM`. Same-file
  `const` objects and spreads count. An imported env object does not, because the rule cannot see
  it. Keep the git helper in one fixture file so the env is written once.
- `nitpicker/no-node-process-per-test`: no Node process per test. That covers `process.execPath`,
  `node`, `npx`/`npm`/`pnpm`/`yarn`/`bunx`/`tsx`/`ts-node`, a `node_modules/.bin` path, and `fork`.
  Import the function instead. Start the application as a process only through the `AppProcess`
  harness in `<testRoot>/fixtures/app-process.ts`, the subprocess bridge that the `test-runtime`
  analyzer recognizes. Spawning once in `beforeAll` is allowed.
- `nitpicker/no-server-or-worker-per-test`: no `createServer`/`createSecureServer`/`new Server`
  from `node:http`, `https`, `http2`, `net` or `tls`, and no `new Worker` from
  `node:worker_threads`, per test. Start them once in `beforeAll` and reset state between tests, or
  test the logic against an in-memory implementation.
- `nitpicker/no-fixed-sleep-synchronization` (existing, extended): besides `await sleep()` and
  `await new Promise((resolve) => setTimeout(resolve, n))`, it also flags
  `setTimeout(() => resolve(), n)`, `await setTimeout(n)` from `node:timers/promises` and
  `scheduler.wait(n)`. Wait on a condition with `vi.waitFor` or `expect.poll`. It also flags waits
  on wall-clock time. A timeout-based negative assertion, `expect(waitFor(...)).rejects`,
  `expect(vi.waitFor(...)).rejects` or `expect(screen.findByRole(...)).rejects` (a `findBy*` or
  `findAllBy*` call on `screen`, on a `within(...)` result or on a render result, or a bare
  `waitFor`; awaited or not, also through a `const`; a data-layer `repo.findByEmail(...)` is not),
  passes only after the full wait times out, so it is slow and depends on the delay: advance fake
  timers past the delay (`vi.advanceTimersByTime`) and assert absence at once
  (`expect(screen.queryByRole('tooltip')).toBeNull()`). Playwright `<anything>.waitForTimeout(n)`
  and Cypress `cy.wait(500)` (a number literal, or a `const` bound to a number; `cy.wait('@alias')`
  is fine, and so is `cy.wait(0)`) are flagged too: wait on a condition (`await expect(locator).toBeVisible()`,
  `cy.wait('@request')`). The rule covers every test-area file: the test roots (e2e folders under
  them included), `*.test.*`/`*.spec.*` next to sources, and `__tests__` directories (their
  fixtures are skipped). A wait that cannot be avoided gets an exception for the rule.
- `nitpicker/no-raised-test-timeout`: no test, suite or hook timeout above 10 000 ms. That is the
  test timeout nitpicker runs a project's tests with (`languages/typescript/preset/defaults/vitest.quality.config.ts`, which
  Stryker also uses, and the timeout it passes to Vitest, Jest, `node:test` and Mocha; a test keeps them in step; the
  coverage run adds the larger slow-test budget to it, see [Slow tests](#slow-tests)).
  The rule covers the third argument of `it`/`test`, `{ timeout }` options, hook timeouts and
  `vi.setConfig`. A timeout that is not a constant written in the file is also reported. There is
  no e2e exemption; a genuinely long suite needs an exception in the config file.
- `nitpicker/require-test-process-timeout`: synchronous `spawnSync`, `execSync` and `execFileSync`
  calls from `node:child_process` or `child_process` in test-area files need a positive subprocess
  timeout, for example `spawnSync(program, args, { timeout: 10_000 })`. A runner's timeout cannot
  interrupt a synchronous call that blocks Node's event loop. Named import aliases, namespace and
  default imports, CommonJS bindings, local constant options and object spreads count. A missing,
  zero or negative timeout is reported; a timeout or options supplied dynamically is left to the
  caller's contract. The rule sets no maximum: the process budget depends on the operation.
  It covers integration tests and test helpers as well as unit tests, including `test-support/`
  folders under the source roots, and works in the TypeScript,
  JavaScript and React presets. If a process must wait without a deadline, add a reviewed exception
  for the rule in `nitpicker.config.json`. A child that ignores its termination signal can still
  outlive Node's subprocess timeout; this rule checks the configured deadline, not OS containment.
- `nitpicker/no-first-test-charged-setup`: no lazily memoized shared setup that tests reach. It
  reports a call whose value is stored in a module-level `let`/`var` only while that variable is
  empty (`x ??= expensive()`, `x ||= call()`, `x = x ?? call()`, `if (!x) x = call()`,
  `if (x === undefined) { x = call() }`, or `if (x) return x; x = call()`), when an `it`/`test`
  body or `beforeEach` runs it, directly or through same-file helpers. The first test to run pays
  for the setup, reports show that test as slow, and test order matters. Compute it in
  `beforeAll`. Constants, `new` expressions and calls on `path`, `Math`, `Object`, `JSON` and
  similar built-ins are not reported. A deliberate memo needs an exception in the config file.
- `nitpicker/no-unused-dom-environment` (not strict: a finding counts only when new in the diff): a
  runnable test file (`*.test.*`, `*.spec.*`) that runs in `jsdom` or `happy-dom` must use the DOM.
  Keep `node` as the project's environment and put `/** @vitest-environment jsdom */` only on the
  files that render. It reports once per file, on the directive when the file has one.
  - Environment: the file's own `@vitest-environment` or `@jest-environment` directive (found in
    the file text, as Vitest finds it), else the project's. nitpicker loads the project's
    `vitest.config.*` or `vite.config.*` once per snapshot in a short-lived child process, with the
    project's own `vite`, and reads `test.environment` (default `node`), inline `test.projects`
    (`include`, `exclude`, `root`/`dir`, `environment`, `extends: true`) and the `resolve.alias` /
    `test.alias` entries. A file in several projects counts as DOM if any of them is. When the
    config cannot be read, sets `test.browser.enabled`, `test.environmentMatchGlobs` or
    `test.workspace`, or a project is named by path, those files have no known default and only
    directives are checked. An unreadable config is also reported as one report-only finding on
    the config file.
  - Uses the DOM, so nothing is reported: the file, or any project module it reaches through
    imports, re-exports, `require`, dynamic `import()`, `vi.mock`/`vi.importActual`/`vi.doMock`,
    `tsconfig`/`jsconfig` `paths`, Vite aliases, workspace packages linked into `node_modules` and
    barrels: imports a DOM testing package (`@testing-library/*`, `@*/testing-library`,
    `react-dom`, `enzyme`, `@vue/test-utils`, `@storybook/test`, `jest-axe` and similar) or a
    Storybook `composeStories`; imports a `.tsx`, `.jsx`, `.vue` or `.svelte` module; or reads a
    browser-only global (names from the `globals` package's `browser` set that Node does not have;
    `navigator` only beyond `userAgent`, `language(s)`, `platform` and `hardwareConcurrency`).
    Type-only imports and type annotations do not count, nor do `react-test-renderer`,
    `react-dom/server` or `jsdom` imported as a library. When the imports reach deeper than 8
    modules or more than 200 files, or a reached module loads a computed path (`import(name)`,
    `require(name)`), the file is not reported.
  - Setup files: when the project's environment is DOM and one of its `test.setupFiles` (or a
    project module it imports) reads a browser-only global, every file in that project counts as
    using the DOM. Importing a DOM testing package such as `@testing-library/jest-dom` in a setup
    file does not count, since it also loads under `node`.
  - Not seen: DOM use that only shows at run time, or behind a module nitpicker cannot resolve.
    Adding `@vitest-environment jsdom` to such a file does not clear the finding; the only way out
    is an exception for the rule in the config file.
- `nitpicker/no-uninjectable-delay` (production code, not tests): `setTimeout`/`setInterval`
  (global, `globalThis`, or from `node:timers`/`node:timers/promises`) whose delay is a module-level
  `const` of 500 ms or more, inside an exported top-level function that has no parameter which
  could carry the delay. A destructured, defaulted or rest parameter, or one named like
  `options`/`config`/`delayMs`/`timeoutMs`, counts as able to carry it. Inline numbers, delays set
  inside a non-exported helper and class methods are not reported. Tests cannot shorten such a
  delay without fake timers, so accept it as an option with the constant as its default.
- `nitpicker/test-tsconfig-pins-lib-and-types`: a tsconfig object a test serializes with
  `JSON.stringify` must set `compilerOptions.types` and `compilerOptions.lib` (or `noLib`), so a
  fixture `tsc` run does not load every `@types` package and the full default lib. If
  `compilerOptions` spreads an object the rule cannot resolve, it is not checked.
- `nitpicker/no-process-globals-outside-main-guard`: test helper and fixture scripts (test-area
  files that are not `*.test.*`/`*.spec.*`) use `process.argv`, `process.exit` and
  `process.exitCode` only inside a main guard: an `if` whose condition uses `import.meta` (such as
  `import.meta.main`) or `require.main`. Export a function that takes the arguments and returns the
  exit code, so tests can import it instead of spawning it.
- `nitpicker/no-partial-output-assertion` (not strict: a finding counts only when new in the diff, not
  on every touched line): no positive `expect(x).toContain('text')`, ``toContain(`template`)`` or
  `toContainEqual(...)`, also through `.resolves`/`.rejects` and `expect.soft`. A fragment passes
  even when the rest of the output is wrong. Assert the whole output with `toEqual` or `toBe`. A
  negated assertion (`.not.toContain`) is allowed, and so is `toContain` with a non-text argument.
  The same holds for `toMatchObject` and for `toEqual`/`toStrictEqual` given `expect.objectContaining`,
  `expect.stringContaining` or `expect.arrayContaining`, even nested inside an object or array
  literal: pass the whole expected value, using `expect.any(Type)` for a field that varies. Asymmetric
  matchers inside `toHaveBeenCalledWith` are not reported. Output too large or unordered to pin
  needs an exception in the config file.
- `no-restricted-syntax` bans the same constructs as in production code, with the same messages:
  `for(;;)`, `for...in`, `while` and `do...while` (use `for...of`, or `it.each` for one test per
  case), `forEach`, `as` (except `as const`) and
  `<Type>value`; `.then()`/`.catch()`/`.finally()` chains are `nitpicker/no-promise-chain`. `any`
  and non-null `!` are already reported in test files by
  typescript-eslint's `no-explicit-any` and `no-non-null-assertion`. Like the other bans, these are
  strict rules: a finding on a line a change edits, or in a new test file, fails the run. An exception for
  `no-restricted-syntax` lifts all the syntax bans for those paths.
- Weak assertions pass whatever the code returns, so `vitest/no-restricted-matchers` bans
  `toBeDefined`, `toBeTruthy`, `toBeFalsy`, `not.toBeNull` and `not.toBeUndefined` (also after
  `.resolves`/`.rejects`): assert the value with `toBe` or `toEqual`. `vitest/prefer-called-with`
  rejects a bare `toHaveBeenCalled()` (pass the arguments), `vitest/require-to-throw-message`
  rejects `toThrow()` without a message or class, and `no-restricted-syntax` rejects a literal
  subject (`expect(true)`). `nitpicker/no-partial-output-assertion` also rejects `toMatch` with a
  string or a pattern that is not anchored `^...$`; an anchored pattern pins the whole value.
- `nitpicker/no-shared-test-state`: no `let` with a value at module level or directly in a `describe`
  callback. Keep the state in the test, or declare it without a value and set it in `beforeEach`.
- `nitpicker/no-copy-pasted-tests`: three `it`/`test` calls in one block whose callbacks are the same
  once literals are ignored are reported from the third on. Write one `it.each` table.
- `nitpicker/fake-timers-require-restore`: a file that calls `vi.useFakeTimers()` needs
  `vi.useRealTimers()` in `afterEach`/`afterAll` (`afterEach(vi.useRealTimers)` counts), in an
  `onTestFinished` callback or in a `finally`. Otherwise the fake clock leaks into the next tests,
  which then time out. With `@testing-library/user-event`, create the user with
  `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`. In a `*.test.*`/`*.spec.*` file the
  rule does the same for `vi.stubGlobal` (restore with `vi.unstubAllGlobals()`) and `vi.stubEnv`
  (`vi.unstubAllEnvs()`); a setup file may stub a global for every test, as jsdom setups do. A
  project whose Vitest config sets `unstubGlobals: true` or `unstubEnvs: true` restores that kind of
  stub itself, so it is not checked there: the flag is read as a literal from the root config, from
  an inline `test.projects` entry (for the files under its `root`) and from the config of a path or
  glob `test.projects` entry (for the files under that package).
- `nitpicker/no-switched-off-tests`: no `it.todo`/`test.todo`/`describe.todo` (`vitest/no-disabled-tests`
  already reports `skip`; neither is a way to switch a test off) and no `skipIf(true)`/`runIf(false)`.
  A real condition such as `skipIf(process.platform === 'win32')` is allowed, and so is `it.fails`,
  which runs and documents a known bug: it starts failing once the bug is fixed.
- `slow-test` (coverage check, head only): an added or edited test fails above 5 s, or 30 s in an integration/e2e test folder. All supported runners share this policy. Suspected slow tests are rerun without coverage instrumentation, using the existing head policy's thresholds and reviewed exceptions; unchanged test calls do not add findings.
- `nitpicker/no-real-time-random-or-network`: in tests, no `Date.now()`, `new Date()` without an
  argument or `Math.random()` (fake the clock with `vi.useFakeTimers()` and `vi.setSystemTime`, or
  spy on `Math.random`; either one anywhere in the file lifts the check), and in unit tests
  (`__tests__/`, `<testRoot>/unit/` and `*.test.*` next to sources) no `fetch`, `http`/`https`
  `request`/`get`, `net.connect` or `new WebSocket`. Inject the client instead.
- `nitpicker/no-uncollected-tests`: a file in the test area that is not named `*.test.*` or `*.spec.*`
  (or `*.test-d.*`/`*.spec-d.*`, Vitest's type tests) but defines `describe`/`it`/`test` at its top
  level is never run by Vitest. Rename it. The structure check reports the same rule on the
  `package.json` of a workspace package (npm, yarn or pnpm workspaces) that has test files but no
  `test` script, when the root test config does not include it either: a root Vitest config's
  `test.projects` (read as literals; a glob or a path to the package or its config counts), its
  `test.include`, Jest's `projects`, or a root `test` script that runs Vitest or Jest itself. The
  finding counts the package's test files and is held while the count does not grow, so a new
  package or a new test file in such a package fails. Add a `test` script or a `projects` entry, or
  add an exception for `nitpicker/no-uncollected-tests` with the package.json path.
- `nitpicker/no-test-helpers-in-source`: a file under a source root that sits in a `testing/`,
  `test-utils/`, `test-helpers/`, `test-support/`, `fixtures/` or `__mocks__/` folder, or is named
  `test-utils`, `test-helpers`, `test-support` or `*.fixtures`, is a test helper. Placed in
  production source it is mutation-tested and shipped. When the project has a test root on disk
  (`layout.testRoots`, `test/` or `tests/` by default), move it under that root, for example
  `test/test-support/`; a `test-support/` folder under a source root is reported too. When no test
  root exists and the tests sit next to the code, a `test-support/` folder beside the code it
  serves is the allowed place for test-only modules and is not reported; the other helper folders
  and names are. The layout then counts those files as test code, so coverage, CRAP and mutation
  leave them out.
- `nitpicker/no-internal-module-mocks` also reports `vi.spyOn(namespace, ...)` on a namespace import
  (`import * as domain`) of production code.
- `nitpicker/no-production-imports-in-setup-files`: a file the project's Vitest or Vite config lists in
  `setupFiles` or `globalSetup` may not import production code (a setup file runs before every test
  file, so calls made there would count as covered). The setup files are read from the config text as
  string literals, so a computed `setupFiles` value (built from a variable) is not checked. A test
  may not mention `__stryker__`,
  `STRYKER_*` or `activeMutant` either (`no-restricted-syntax`): behaviour that depends on the
  mutation harness hides every mutant. For the same reason a test reads a global by its name
  (`globalThis.name`), not by a computed key (`Reflect.get(globalThis, key)`, `globalThis[key]`).
- `vitest/no-conditional-expect` (from the vitest recommended set) reports an `expect` inside a `catch` or a branch; the message adds that a test asserts a failure with `expect(() => run()).toThrow(Specific)` or `await expect(promise).rejects.toThrow(Specific)`.
- `vitest/no-conditional-in-test` is enabled for test files: no `if`, ternary or `&&`/`||` branching
  inside a test body. Give each outcome its own `it.each` table row instead of branching on it.
- The vitest config nitpicker runs tests with (`defaults/vitest.quality.config.ts`, used for
  coverage and mutation) sets `restoreMocks: true`, so a `vi.spyOn` spy is restored after every test
  even when an assertion fails, and cannot leak into the next test. It also overrides a
  `restoreMocks` value in the project's own vitest config for these runs. Jest runs with
  `--restoreMocks` for the same reason, and `node:test` restores a test's `t.mock` itself. Neither
  Vitest nor Jest restores fake timers automatically: call `vi.useRealTimers()` (or
  `jest.useRealTimers()`) in `afterEach`.

- `test-console-output` (the `test-console` check, not an ESLint rule): a test file that prints
  `console.error` or `console.warn` output the base run did not print fails, with the message and
  the test that printed it. A change that makes a suite start printing one (a React update on an
  unmounted component from a timer that survives the test, a key warning, a logged error) is
  usually a bug, and warnings in a suite hide the next real one. The allowed forms are fixing the
  cause (cancel the timer or subscription in the cleanup), a `testConsole.allow` entry for a known
  third-party message, or an `exceptions` entry for the test file. Messages are compared by their
  normalized text, per test file, so an old warning that only moved is not new. See
  [Console output from tests](usage.md#console-output-from-tests).

Left out, from the same write-up: recomputing one expensive result in every test, and running the
whole pipeline to check a decision made earlier. Both need a heuristic (repeated constant arguments
across tests, or what an assertion depends on), so a finding would not reliably mean a slow test.
Vitest's worker count in CI is a CI setting, not code. It belongs in the CI workflow or in a check
of the project's CI files, not in these rules. That check would need its own analyzer (a runner
kind, a version entry, a check definition and project-level findings) and is not built yet.

## Slow tests

- **Rule.** `slow-test` fails a test the change adds or edits when it takes more than 5 s as a unit
  test, or more than 30 s as an integration test (`thresholds.unitTestSeconds` and
  `thresholds.integrationTestSeconds`), the same rule, message shape and budgets as for
  [Java and Kotlin](java-preset.md#slow-tests) and [Python](python-preset.md#slow-tests). Its tool
  is `test-runtime`; the finding prints the bare route `slow-test`, and `test-runtime/slow-test` is
  accepted in `exceptions` as the same rule. The message names the budget, the measured time, the
  fixes (fake timers instead of waits, fakes for network, database and disk, or moving the test to
  an integration test) and the exception. It is reported by the `coverage` analyzer, which already
  runs the tests, so a failing test run reports `tests-failed` and no slow tests, and disabling `coverage` also
  turns the check off. TypeScript,
  JavaScript and React share it. `exclude` applies: a test in an excluded file is not checked.
- **Measurement.** Head only, from the per-test `duration` of the report the project's runner
  writes for the coverage run (Vitest and Jest JSON, the `node:test` reporter, Mocha JSON), which
  runs with coverage instrumentation, four workers at most, and so measures slower than a plain run.
  Only passed tests are timed (a failed or skipped test has no meaningful duration), and a test that
  ran more than once keeps its slowest time. A test over the smaller budget in that run is run again
  once, alone: only its file, selected by its full name, with one worker and without coverage, through
  the same runner seam. It is reported only when it is still over its budget, with the time of the
  second run; a second run that fails or finds nothing keeps the first time. So one noisy
  instrumented timing never fails a change, and the rerun starts no extra process when no test is
  slow. The seam's per-test timeout is 10 000 ms plus the larger of the two budgets (40 000 ms by
  default), so a test that takes longer than 10 s can be measured at all;
  `nitpicker/no-raised-test-timeout` still bans a project from raising its own timeout past
  10 000 ms.
- **Unit or integration.** A test is an integration test when its file is under the `e2e/` test
  root, or has a folder named `integration`, `integrations`, `e2e`, `end-to-end`, `functional`,
  `acceptance` or `system` (also with a `-tests` or `_tests` suffix, and `__integration__`) below
  one of the test roots (or below an `__tests__` folder), or is named `*.integration.test.*`,
  `*.e2e.test.*`, `*.int.test.*` or `*.it.test.*` (also `.spec.`). A production folder such as
  `src/integrations` is not a test folder. Every other test is a unit test.
- **Edited or added.** A test is found in its file by its full name (the `describe` titles and the
  test title joined by spaces, the way the runners report it); `it.each` and `describe.each` titles
  (`%s`, `%i`, `$name`), template titles and concatenated titles match as patterns, and a title the
  source does not spell out matches any name. A test counts when its call text (whitespace
  collapsed) differs from the base file's call with the same titles, or the file is new. A reported
  test no call names counts when its file differs from the base. Slow tests the change does not
  touch stay baselined, and the base snapshot reports none.
- **Exception.** `{ "rule": "slow-test", "paths": ["test/db/**"], "reason": "..." }` in the
  top-level `exceptions`, as printed in the message.
- **Tests.** `languages/typescript/adapters/slow-tests/` (fake runner reports with a temporary
  project and baseline, the rerun, the title patterns, the path rules) and
  `slow-tests-runners.test.mjs` (a test that really waits, on each of the four runners, asserting
  only that the rule fires).

## React

The React scope turns on when `react` is in the analyzed project's `dependencies` or
`devDependencies` (a peer dependency alone does not count), or when `nitpicker.config.json` sets
`"react": { "enabled": true }`; `"enabled": false` turns it off whatever `package.json` says. A
project without React gets none of the rules below and no change to the rules above. The scope covers
production source under the source roots (every extension the preset lints, `.jsx` included); the test rules at the
end of this list cover test files. Each rule names the allowed form in its message and, where it can flag legitimate code, says
to add an exception for the rule in `nitpicker.config.json`. An exception that names a React rule is skipped while the scope is
off (a PR that adds or removes React keeps linting on both sides); a misspelled rule is still an error.

- **Browser globals by name** (`no-restricted-globals`). Outside a React Native app the scope
  declares the browser globals for source and test files, so the confusing ones (`event`, `name`,
  `status`, `length`, `close`, `open`, `top`, `parent`, `origin` and the rest of the standard
  confusing-browser-globals list) are restricted wherever those globals apply, `domain/` aside:
  `onPick(name)` with no `name` in scope is a missing parameter, not `window.name`. Write
  `window.name` when the global is meant; otherwise take the value as a parameter
  (`onClick={(event) => ...}`) or declare it.
- **Function components only** (`react-x/no-class-component`). Class components are flagged; error
  boundaries, which React only supports as classes, are allowed. The "classes only for `Error`
  subclasses" ban leaves classes that extend `Component` or `PureComponent` to this rule in a React
  project, so each class gets one message.
- **Rules of hooks and exhaustive dependencies** (`react-hooks/rules-of-hooks`,
  `react-hooks/exhaustive-deps`), both as errors. A dependency that is left out on purpose needs an
  exception for `react-hooks/exhaustive-deps`.
- **No derived state in effects** (`nitpicker/react-no-effect-derived-state`). A state setter called
  in the body of a `useEffect` or `useLayoutEffect` callback, whose dependency array is not `[]`, is
  flagged: compute the value during render (`useMemo` when it is costly). Each case has its own
  message: a setter given a fixed value (`setDraft('')`, `[]`, `{}`, `undefined`) on a dependency
  change is a reset, so render the component with that prop as its `key` (`<Form key={userId} />`);
  a setter fed from `localStorage` or `sessionStorage` reads the store during render with
  `useSyncExternalStore`.
  The hooks are resolved through their `react` import (`import { useEffect as onEffect }` and
  `import * as R from 'react'` count; a hook of the same name from another module does not), and
  the setter can be `const [x, setX] = useState()` or `useState()[1]` kept in a variable. A function
  declared in the effect body and called there synchronously counts as the body. Setters called from
  other nested callbacks (a subscription, an event handler, `.then`, after an `await`) are not
  flagged, and neither is `[]` (the mounted-flag pattern) or a function declared outside the effect.
  Subscribing to an external store (`matchMedia`) is better written with `useSyncExternalStore`;
  measuring the DOM in `useLayoutEffect` is the usual legitimate exception.
- **No data fetching or async work in effects** (`nitpicker/react-no-effect-data-fetching`).
  `fetch` (also `window.fetch` and `globalThis.fetch`), `axios`, `ky` and `new XMLHttpRequest`
  in work the effect itself does are flagged: use a data-fetching library (TanStack Query
  `useQuery`, SWR `useSWR`) or the framework (a route loader, a Server Component). Beyond the
  names, async work is flagged when its result flows into state: a state setter (`setX`) called
  after an `await`, inside a `.then` callback or passed to `.then` (`load(id).then(setUser)`). It is
  reported once per effect, at its first async step. The effect's own work is its callback, a
  helper or IIFE declared in it and called by it, and the callbacks it hands to `setTimeout`,
  `setInterval` or `requestAnimationFrame`; a handler the effect only registers
  (`addEventListener('pagehide', ...)`, where a `keepalive` beacon belongs) is not. A promise whose
  result stays out of state is syncing with an external system and passes: an animation
  (`animate(scope.current, ...)`), `void changeLanguage(locale)`, `void ref.current?.play()`. The
  rule needs no type information. The message names the form for each kind of work: data through
  `useQuery` or a route loader, an action (a save, a clipboard write) in the event handler that
  causes it, a redirect by rendering `<Navigate />`.
- **No prop callbacks called from effects** (`nitpicker/react-no-effect-event-handling`). An
  effect that calls a prop callback (`onSave(value)`, `notify(value)`, `props.onChange()`, one
  destructured with `const { onChange } = props`, also renamed as `{ onChange: report }`, or one
  held in a ref, `const latest = useRef(onChange); latest.current(value)`) reacts to a change
  instead of to an event: call the callback in the handler that causes the change. Any prop of a
  component counts, whatever its name; a custom hook's parameters count when named `on*`. An effect with no
  dependency array runs after every render and is reported too. A call inside a nested function (a
  subscription, a timer) and an effect with `[]` are left alone; an effect that synchronizes with
  an external system needs an exception.
- **No array index as `key`** (`react-x/no-array-index-key`): use a stable id from the item. Every
  element rendered from a list has a `key` (`react-x/no-missing-key`) and siblings do not repeat
  one (`react-x/no-duplicate-key`). A `key` built from `Math.random()`, `Date.now()`,
  `new Date()`, `performance.now()`, `crypto.randomUUID()` (also through `window.` or
  `globalThis.`), a generator imported from `uuid`, `nanoid`, `cuid`, `@paralleldrive/cuid2`,
  `ulid` or `short-uuid` under any local name, or `randomUUID` from `node:crypto`, directly, inside
  a template or expression, through a `const` declared in the component
  (`const id = crypto.randomUUID(); key={id}`), or through a helper that returns one (a function in
  the same file, `function makeKey() { return Math.random(); }`, or an exported function of a
  project module the file imports, `genId()` from `../shared/ids`; one level deep), is flagged
  (`nitpicker/react-no-random-key`): it changes on every render and remounts the row.
  `react-x/purity` leaves a call inside a `key` to this rule, and the `Math.random` restriction of
  `no-restricted-properties` is dropped where this rule reports the same call, so it is reported
  once.
- **Pure render, no mutation.** State, props and hook results are not mutated
  (`react-x/immutability`: `setList([...list, item])`, `items.toSorted()`); render does not call
  `Date.now()`, `Math.random()` or storage, read or write refs, or set state
  (`react-x/purity`, `react-x/refs`, `react-x/set-state-in-render`). A lazy `useState(() => ...)`
  initialiser is the place for a one-time read; a ref may be lazily initialised in render
  (`if (ref.current === null) ref.current = new Player()`), but its value is read in handlers and
  effects. These rules come from the React Compiler's
  analysis and can flag legitimate code, so each message names the exception.
- **Components are declared at module level** (`react-x/no-nested-component-definitions`,
  `react-x/static-components`, `react-x/no-nested-lazy-component-declarations`): a component
  declared inside another remounts, and loses its state, on every render. A nested function or
  class is reported by the first rule; `static-components` reports only a component built by a
  call during render (`const Themed = withTheme(Panel)`), so each case gets one message.
- **One form per construct.** `{count && <p />}` renders `0` for a number, so compare
  (`count > 0 && ...`) or use a ternary (`react-x/no-leaked-conditional-rendering`, needs type
  information). A context value, and a default prop, that is an object, array or function literal
  is a new value on every render: hoist it or wrap it in `useMemo`
  (`react-x/no-unstable-context-value`, `react-x/no-unstable-default-props`). `ref` is a plain prop
  and `<Context value={...}>` is the provider (`react-x/no-forward-ref`,
  `react-x/no-context-provider`); both are off when the installed `react` (or, when none is
  installed, the declared range) of the head checkout is older than 19. The major is read once into
  the head policy (`react.major`) and passed to the React plugins as their React version, so a pull
  request that upgrades React to 19 reports no existing `forwardRef` as new.
- **Browser APIs** (`eslint-plugin-react-dom`): no `dangerouslySetInnerHTML` (render JSX; sanitised
  and reviewed HTML needs an exception for `react-dom/no-dangerously-set-innerhtml`), an explicit
  `type` on every `<button>`, `rel="noreferrer noopener"` next to `target="_blank"`, no
  `javascript:` URLs. Effects clean up after themselves (`eslint-plugin-react-web-api`): an
  `addEventListener` is paired with `removeEventListener` of the same named function, and a
  `setInterval`, `setTimeout`, `ResizeObserver` or `IntersectionObserver` is cleared or
  disconnected in the returned cleanup. Fetching in an effect is covered by the data-fetching rule
  above.
- **No direct DOM changes in components** (`nitpicker/react-no-direct-dom`), in files that render
  JSX, files under `ui/`, `shared/` and `lib/` (the helpers UI code imports) and hook files
  (`use*`). `document.getElementById`/`querySelector`/`querySelectorAll` and `getElementsBy*`
  (also through `window.document`, `globalThis.document`, an alias of `window` or `document` in a
  `const` or a `let` that is never reassigned, or an element's `ownerDocument`), assignments to
  `.innerHTML`, `.outerHTML`, `.innerText` or `.textContent`, `insertAdjacentHTML`,
  `insertAdjacentText`, `setHTMLUnsafe`, `createContextualFragment` and `document.write`/`writeln`,
  and `.className`, `.style.*`,
  `style.setProperty`/`removeProperty`, `Object.assign(el.style, ...)` or `classList.add`,
  `remove`, `toggle`, `replace` on anything but a ref (`ref.current`, or a const read from it),
  `document.documentElement` or `document.body` are flagged: state and props drive the DOM.
  `setAttribute`, `removeAttribute` and `toggleAttribute`, and inserting nodes (`append`,
  `appendChild`, `prepend`, `insertBefore`, `replaceChildren`, ...) are flagged on a queried or
  created element and on `document.head`; `documentElement` and `body` may change their attributes,
  and a ref may receive children. Render into another node with `createPortal`. Files under
  `adapters/` are checked even without JSX. The file that mounts the app with `createRoot`,
  `hydrateRoot` or `createPortal` may look up its container. Glue for a third-party widget or a
  file download needs an exception.
- **Form fields** (`nitpicker/react-field-has-label`, `nitpicker/react-controlled-input`). An
  `<input>`, `<textarea>` or `<select>` has a label: wrapped in `<label>` or in a label component
  (any component named `Label` or ending in `Label`: `<FormLabel>`, `<Form.Label>`), an `id` that a
  `<label htmlFor>` or a label component with `htmlFor` (`<Label htmlFor="email">`, `<Form.Label>`)
  in the same file points to (a computed `id` is accepted), `aria-label` or
  `aria-labelledby` (hidden, submit, reset, button and image inputs, and fields with spread props,
  are left alone). A field is either controlled (`value` or `checked` with `onChange`, `readOnly`
  or `disabled`) or uncontrolled (`defaultValue`), never `value` with `defaultValue`; a form library
  that needs otherwise takes an exception.
- **One styling approach** (`nitpicker/react-single-styling-approach`), chosen with
  `react.styling`: `class-names` (`className` with CSS Modules, plain stylesheets or utility
  classes; inline `style` objects and CSS-in-JS libraries are flagged), `css-in-js` (styled-components,
  Emotion, Stitches, goober, Linaria; stylesheet imports and inline `style` objects are flagged) or
  `inline-style` (`style` objects; stylesheet imports and CSS-in-JS libraries are flagged) or
  `style-sheet` (React Native `StyleSheet.create` styles; inline `style` objects of fixed values,
  stylesheet imports and CSS-in-JS libraries are flagged). Unset, the approach is the one most
  source files of the head checkout use: files that import a stylesheet or pass `className`, files
  that import a CSS-in-JS library, files that call `StyleSheet.create` and files with inline
  `style` objects are counted, and the largest group wins (ties in that order). Only with no
  styling in the code yet does `package.json` decide: `css-in-js` when it lists one of those
  libraries, `style-sheet` when it lists `react-native` or `expo`, else `class-names`. The approach
  is resolved once into the head policy (`react.styling`) and both sides are linted with it, so a
  pull request that adds MUI and Emotion does not turn every CSS Modules file into a finding.
  A `style` object is flagged only when all its values are fixed (literals, or arrays and objects
  of literals): a value computed at runtime (`style={{ width: progress }}`,
  `<Animated.View style={{ opacity: fade }} />`, `{ paddingTop: insets.top }`) is the allowed use
  of `style` under every approach, and the message names the form for fixed values (a class with
  `className={styles.title}`, a styled component, or a module-level `StyleSheet.create`). The
  object is checked when it is written inline, bound to a `const` in the same file (also
  `style={styles.box}` and `styles['box']` on a `const styles = { box: {...} }`), or reached
  through `?:`, `&&`, `??`, `satisfies` or `as`; `css=` and `sx=` props, `style` inside spread
  props and a `style` value that is not an object literal (`style={style}`) are not checked. An
  object of only CSS custom properties (`'--progress': percent`) is allowed. This is the default
  because inline `style` objects of fixed values are the usual agent slop.
- **No hard-coded colors** (`nitpicker/react-no-hardcoded-colors`). Every production source file
  of the scope is checked (`.ts` and `.mjs` helpers included; tests and story files,
  `*.stories.*` and `*.story.*`, are not; the story pattern is `storyGlobs` in
  `eslint-config/scope-support.mjs`, shared with the i18n scope). A whole string that is a 6- or
  8-digit hex color (`'#336699'`) or a color function with
  literal arguments (`rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`, `lch()`, `oklab()`,
  `oklch()`, `color(display-p3 ...)`) is reported anywhere. A 3- or 4-digit hex (`'#add'`) and a
  named color (`red`, `gray`) are reported only in a color position, so ids, hashes and anchors
  that happen to look like colors are left alone. The color positions are:
  - the value of `color`, `backgroundColor`, `background`, `borderColor`, `fill`, `stroke`,
    `outlineColor`, `textDecorationColor` or `caretColor`, as an object key or as a JSX attribute
    (`<svg fill="red">`). A named color under such a key is reported only in a JSX attribute or in
    a style context, so domain data such as `{ name: 'Tee', color: 'black' }` passes;
  - a style context: the JSX `style`, `sx` and `css` attributes, an object passed to `styled`,
    `css`, `keyframes`, `createGlobalStyle` or `StyleSheet.create`, and an object typed or
    asserted as `CSSProperties` and similar style types. Compound values are checked there
    (`border: '1px solid #ccc'`, `boxShadow: '0 0 4px rgba(0, 0, 0, 0.2)'`);
  - the text of a `styled.x`, `styled(X)`, `css`, `keyframes` or `createGlobalStyle` template
    (comments and `url(#id)` references are ignored), where a named color is reported as the
    whole value of a color property (`color: red;`, `background-color: white !important;`);
  - a CSS declaration in any other string or template, with a color-bearing property name at the
    start or after `;` or `{` (`'border: 1px solid #ccc'`, `'a:1; --brand: #336699'`), so prose
    such as `'Invalid color: #fff is not allowed'` passes, and a Tailwind arbitrary value
    (`bg-[#336699]`, `bg-[rgb(0,0,0)]`).

  Prose that mentions a color function (`'Use rgb(255, 0, 0) format'`), `rgb(var(--brand-rgb))`,
  `transparent`, `currentColor`, `inherit`, `initial` and `unset` are fine. Take the color from the
  theme or palette (a theme token, a CSS variable, `currentColor`). The file or folder that
  defines the palette gets one exception for the rule (`src/theme/**`); there is no filename
  heuristic.

- **One optional input per concept** (`nitpicker/no-singular-and-plural-prop`). A component's props
  type (or an exported `*Props` type) that declares both `tag?: string` and `tags?: string[]` offers
  two ways to pass the same data. The rule reports the plural when both props are optional and the
  plural is an array (`T[]`, `readonly T[]`, `Array<T>`, `ReadonlyArray<T>`) of the singular's type;
  keep the plural and pass a single item as a one-element array. Props that differ in type, a
  required prop, a prop typed `never` in a discriminated union and props in different union branches
  are not reported. Aliases and interfaces in the same file are followed; types imported from other
  files are not.
- **Exclusive props are a type, not a check** (`nitpicker/no-runtime-exclusive-props-check`). An
  `if` in a component body whose condition tests two or more of its own props the same way (`a && b`,
  `!a && !b`, `a !== undefined && b !== undefined`, `a != null && b != null`, only `&&` chains of
  props with nothing else in them) and whose branch rejects, by `throw`, `console.error(...)` or
  `console.warn(...)`, is flagged: make the props a discriminated union
  (`{ icon: Icon; image?: never } | { image: string; icon?: never }`) so the compiler rejects the
  combination. Props are the destructured parameter names or `props.name`. A branch that renders a
  fallback, returns `null`, logs at another level or sets state is not flagged, and neither is a check
  inside a nested function or a hook callback.
- **A story for every component, where Storybook is used** (`component-story-missing`, a check of
  the `structure` analyzer, not an ESLint rule). A package whose nearest `package.json` lists
  `storybook` or an `@storybook/*` package is checked: each source file in it that exports a real
  component (a function returning JSX, a `memo` or `forwardRef` result or a class extending
  `Component` or `PureComponent`; not objects, arrays or tables holding JSX) needs a story. The
  story is `<Name>.stories.<ext>` or `<Name>.story.<ext>` (any code extension, the story pattern
  the i18n scope uses), anywhere under the source roots of the same package (beside the component,
  in a `__stories__` folder or in a top-level `src/stories/` as Storybook's setup creates it), named
  after any component the file exports, after the file, or after the folder for an `index.*` file
  (`Card/index.tsx` with `Card/Card.stories.tsx`). MDX docs pages do not count, because they hold
  no stories. Story files and files under `__stories__` or `stories` are not components. Each
  component of a file without a story is its own finding, located at its declaration, so a second
  component added to a file that has none is a new finding. A finding is enforced when more than half of the checked
  components have a story, and only reported (`descriptive`) otherwise, so a project adopting
  stories is not failed on every old component. That decision, and whether Storybook is present, are
  read from the head checkout on both sides of a comparison, so a pull request that adds Storybook or
  crosses the half mark does not turn untouched components into new findings. An exception lists the
  file; the message carries the exact entry:
  `{"rule":"component-story-missing","paths":["src/Card.tsx"],"reason":"..."}`.
- **TypeScript sources in a TypeScript project** (`javascript-in-typescript-project`, a check of
  the `structure` analyzer). In a project with a `tsconfig.json` (read from the head checkout on
  both sides), every `.js`, `.mjs`, `.cjs` or `.jsx` file under the source and test roots is a
  finding with the file as its identity, so only a file a change adds fails. The message names the
  TypeScript file to write instead (`.mjs` to `.mts`, `.jsx` to `.tsx`) and the exception entry,
  `{"rule":"javascript-in-typescript-project","paths":["src/cli.mjs"],"reason":"..."}`.
  `layout.entryPoints` are skipped, and the JavaScript preset does not run the check.
- **Accessibility** (`jsx-a11y/*`): the recommended `eslint-plugin-jsx-a11y` rule set plus
  `control-has-associated-label` (buttons, links and roles need text or `aria-label`; form fields
  are covered by the field rule above), `anchor-ambiguous-text` (no "click here"),
  `no-aria-hidden-on-focusable` and `prefer-tag-over-role`, as errors. `<label>Name <TextField /></label>`
  counts as a labelled control for any capitalised component.
  `jsx-a11y/mouse-events-have-key-events` is configured beyond the recommended default, which only
  checks `onMouseOver`/`onMouseOut`: `onMouseEnter` also needs `onFocus` and `onMouseLeave` also
  needs `onBlur`, so hover-only cards are caught. Each jsx-a11y message ends with the allowed form
  where one exists (`accessibilityHints` in `eslint-config/react/rules/accessibility-rules.mjs`,
  for example "Give it visible text (`<button>Close</button>`) or `aria-label="Close"`; `title` is
  not a label.") and with the exception route.
- **`null` for refs and contexts.** `null` stays banned, except as the argument and the type
  argument of `useRef` and `createContext` (`useRef<HTMLDivElement>(null)`,
  `createContext<Theme | null>(null)`), where React's types need it.
- `@typescript-eslint/no-misused-promises` stops flagging `async` event handlers in JSX attributes
  (`onClick={async () => ...}`), which is the normal React form. `no-confusing-void-expression`
  stops flagging a shorthand arrow whose contextual type returns `void`
  (`onChange={(event) => setTitle(event.target.value)}`).
- **Component tests** (test files only: the test roots, which default to `test`, `tests`,
  `__tests__` and `e2e` at the repo root, `*.test.*` and `*.spec.*` files under the source roots,
  and `__tests__` directories under them). They need no particular test runner (Vitest or
  Jest), and report in every `.tsx` and `.jsx` test (except Playwright and Cypress component
  tests), in a test that imports `@testing-library/*`, `react`, `react-dom` or another `react-*`
  package, `enzyme`, `react-test-renderer`, or a project `test-utils` module (relative, through a
  tsconfig `paths` alias such as `@/test-utils`, or re-exported by a barrel), in a test that mocks
  `react` or `react-dom` with `vi.mock`/`jest.mock`, and in a test that imports a project helper
  that imports `@testing-library/*`, `enzyme` or `react-test-renderer` (`@/test/render` exporting
  its own `renderApp`, also through a barrel such as `@support`; followed up to four imports deep),
  so Playwright and domain tests in the same roots are left alone. An import of such a helper counts
  as the Testing Library import, so queries on what it returns are checked. Query by accessible
  role, not test ids (`testing-library/no-test-id-queries`) or DOM traversal, class selectors and
  `container` queries (`testing-library/no-node-access`): `screen.getByRole('button', { name: 'Save' })`,
  or `toHaveFocus()` for focus. Query through `screen`, not through queries destructured from
  `render(...)` (`testing-library/prefer-screen-queries`, in Testing Library's own React
  recommendations); `within(element)` scopes a query to part of the page. Drive the component with `userEvent`, not `fireEvent`
  (`testing-library/prefer-user-event`), and `await` every `userEvent` call, `findBy*` query and
  `waitFor` (`testing-library/await-async-events`, `await-async-queries`, `await-async-utils`);
  a project on user-event v13, whose calls are synchronous, needs an exception for
  `await-async-events`. Create the user with `const user = userEvent.setup()`
  (`testing-library/prefer-user-event-setup`, for the default and the named `userEvent`
  import alike). Check presence with `getBy*` and absence with
  `queryBy*` (`testing-library/prefer-presence-queries`). Do not wrap `render` or `user` calls
  in `act` (`testing-library/no-unnecessary-act`), leave `screen.debug()` and other debug
  output in (`testing-library/no-debugging-utils`) or call `cleanup` yourself
  (`testing-library/no-manual-cleanup`, on when the project's Vitest config sets
  `globals: true` or the project has no Vitest; with `globals` unset or false, Testing Library
  cannot register its own cleanup, so the `afterEach(cleanup)` a setup file needs passes). Do not test implementation details
  (`nitpicker/react-test-no-implementation-details`): no `.instance()`, no `.state()` or `.setState()` on
  an enzyme or test-renderer wrapper (a store's `setState` is fine), no test-renderer
  `findByType`/`findByProps`, no React fiber internals (`_reactInternals`,
  `stateNode`, `memoizedState`) and no `spyOn` on a React hook (`vi.spyOn(React, 'useState')`,
  `jest.spyOn(R, 'useEffect')`, `vi.spyOn(require('react'), 'useState')`, with `React` or any
  binding of `react`: a default, namespace, `{ default as R }`, `import = require`, `require`
  (anywhere in the file), `await import('react')` or `vi.importActual('react')` binding, or an
  alias such as `const R = React`), and no `vi.mock('react', ...)` or `jest.mock('react', ...)`
  (nor a `react-dom` mock that replaces a hook); Testing Library's guiding principle is to
  test the way the software is used, so assert what the user sees, or test a custom hook with
  `renderHook`. An element with no role or accessible name needs an exception. A test file that hovers
  (`user.hover`, `userEvent.hover`, `fireEvent.mouseEnter` or `mouseOver`, or a `user.pointer` call
  that only moves to a `target`) must also exercise the keyboard path somewhere in the same file:
  `user.tab()`, `user.keyboard(...)`, `user.type(...)` with a `{Enter}`-style key token, `.focus()`,
  `fireEvent.focus`, `focusIn`, `keyDown`, `keyUp` or `keyPress`, a `press`, `down` or `up` call
  (`locator.press('Enter')`), or any call through a `keyboard` object (`page.keyboard.press('Tab')`).
  `nitpicker/hover-test-needs-keyboard`
  reports the first hover when none appears: add a test that tabs to the element and asserts the
  same state. A hover-only control gets an exception. A project with
  `@testing-library/react-native` keeps `testID` queries, the idiom there.
- **Component test setup.** A Vitest project needs four things before the first component
  test passes: `test.environment: 'jsdom'` (or `happy-dom`) in the Vitest config;
  either `test.globals: true`, so Testing Library registers its `cleanup` after each test, or
  `afterEach(cleanup)` in a setup file (without one of them the second test that renders sees the
  first one's DOM; `testing-library/no-manual-cleanup` follows the project's choice, read into the
  head policy as `react.autoCleanup`);
  `import '@testing-library/jest-dom/vitest'` in a file listed in `test.setupFiles`, for
  `toBeInTheDocument()` and the other DOM matchers; and the named import
  `import { userEvent } from '@testing-library/user-event'`, because the default import has no
  `setup()` under `module: NodeNext`. When a test fails with `document is not defined`,
  `Invalid Chai property: toBeInTheDocument` or `afterEach is not defined`, the `tests-failed`
  message ends with a hint that names the missing setup line
  (`adapters/quality-areas/reporting/failure-lines.mjs`).
- **Snapshot-only tests are allowed.** No rule bans a test whose only assertion is
  `toMatchSnapshot()` or `toMatchInlineSnapshot()`. A snapshot can pin a rendered structure
  deliberately, and there is no general recommendation against it nor a weird pattern with a
  standard alternative. The bans above still apply inside such a test.
- **Use the library's component** (`redefined-library-component`, reported by the `structure`
  check). A component definition (a top-level PascalCase function, or `const` arrow function,
  function expression, `memo` or `forwardRef`, in a `.tsx` or `.jsx` file) whose name is one that
  production files render from a package is reported, for example a second `Card` when `<Card />`
  from `@acme/ui` is rendered in several files. A name counts only when the package is listed in the
  `package.json` of the file (or the project root), so a bundler alias such as `@components/Button`
  is not a package, and only when the project uses it as a JSX element, so a `Request` or an ORM
  `Table` that is never rendered does not. Names come from named imports rendered as a top-level
  element (the imported name, not the local alias) and a default import of a deep path whose last
  segment is the local name (`import Button from '@mui/material/Button'`); a namespace member
  (`<Tabs.List />`) and the icon packages of `scopePackages.icons` (an imported `Search` icon) do
  not count. Relative imports, `tsconfig.json` aliases such as `@/` and `~/`, and type-only imports
  are not packages. A file that imports anything from a package that exports the name, directly or
  through project modules that re-export it (a `../ui` barrel over `@acme/ui`), is not reported: it
  is a wrapper. A workspace package counts as a library, but its own components are not reported
  against it. Use the library's component, compose it under a different name, or rename the new one.
- **Use the icon library** (`new-icon-asset`, reported by the `structure` check). An icon-sized
  `.svg` file (a `viewBox`, or without one a `width` and `height`, of 48 or less in both dimensions;
  logos and illustrations are larger, and a sprite sheet with neither is not an icon) under the
  source roots is reported when `package.json` lists an icon package, one of the names in
  `scopePackages.icons` in `languages/typescript/preset/eslint-config/scope-support.mjs`
  (`lucide-react`, `react-icons`, `@heroicons/react`, `@mui/icons-material`, `@tabler/icons-react`,
  `@phosphor-icons/react`, ...). The framework favicon conventions (`icon.svg`, `favicon.svg`,
  `apple-icon.svg`), names with `logo` or `brand` in them, and generated, test, excluded,
  `__mocks__/`, `__fixtures__/`, `fixtures/` and `stories/` folders are skipped, and the extension
  matches in any case. Both the React scope and the icon package are read once from the head
  checkout and written into the head policy for both sides, like `react.enabled`, so a pull request
  that adopts an icon package does not report every old svg. Existing files are baselined by path. A
  new icon or illustration that is a design decision needs an exception for the file.

### Vite, Next.js and other framework conventions

- **App entry.** The file that mounts the app runs work at import time on purpose. When
  `package.json` lists `vite` (or a `vite.config.*` exists), the module scripts of `index.html`
  (`<script type="module" src="/src/main.tsx">`), else the first of `src/main.tsx`, `src/main.ts`,
  `src/main.jsx` and `src/main.js` that exists, are detected as entry points and the module-load
  rule skips them. List another entry file yourself:
  `"layout": { "entryPoints": ["src/main/main.tsx"] }`. Side-effect imports of stylesheets
  (`import './index.css'`, also `.scss`, `.sass`, `.less`, `.styl`, `.pcss`) are not module-load
  effects.
- **CSS Modules and assets.** `import styles from './panel.module.css'` and image imports need
  types. Add `vite/client` to `types` in `tsconfig.json`, or put
  `/// <reference types="vite/client" />` in a `.d.ts` under `src/` (what `create-vite` generates as
  `vite-env.d.ts`), or declare the module in a `.d.ts`. Hand-written `.d.ts` files under the source
  roots are part of the type-check program, so these declarations take effect.
- **Default exports.** The framework files that need `export default` are detected from the head
  checkout and allowed: with `next` in `package.json` (or a `next.config.*`), the App Router files
  `page`, `layout`, `loading`, `error`, `global-error`, `not-found`, `template`, `default` and
  `route`, `forbidden` and `unauthorized` and the metadata routes `sitemap`, `robots`, `manifest`,
  `icon`, `apple-icon`, `opengraph-image` and `twitter-image` under `app/` or `src/app/`, every
  file under `pages/` or `src/pages/`, and `middleware` or `proxy` (Next 16) at the root or in
  `src/`; with `@react-router/dev`, an `@remix-run/*` package or a `react-router.config.*` file,
  the route modules: `app/root.*`, `app/routes.*`, `app/entry.client.*`, `app/entry.server.*` and
  every file under `app/routes/`; with `@storybook/*` or `storybook` (or a `.storybook/` folder),
  `*.stories.*` and `*.story.*`; with `expo-router`, every file under `app/` or `src/app/`. The
  detected globs and entry points are written into the head policy (`frameworks`) for both sides.
  Other framework files take an exception scoped to those paths:
  `"exceptions": [{ "rule": "nitpicker/no-default-export", "paths": ["src/routes/**"], "reason": "framework file convention" }]`.
  The default-export ban is its own rule, so the exception lifts nothing else for those paths.
- **Lazy components.** The standard `lazy(() => import('./x').then(...))` is a promise chain. Use
  `lazy(async () => ({ default: (await import('./badge.js')).Badge }))`.
- **`null`.** `useRef<HTMLDivElement>(null)` and `createContext<T | null>(null)` are allowed. Anything
  else a library forces is an exception for `nitpicker/no-null` on those paths (promise chains a
  library forces: `nitpicker/no-promise-chain`).

`eslint-plugin-regexp` (MIT) supplies `regexp/no-super-linear-backtracking` in every project, React
or not.

The plugins are `eslint-plugin-react-hooks`, `eslint-plugin-react-x`, `eslint-plugin-react-dom` and
`eslint-plugin-react-web-api` (the last three are eslint-react, MIT, pinned to one version),
`eslint-plugin-jsx-a11y-x` and `eslint-plugin-testing-library` (whose peer range includes ESLint 10). `eslint-plugin-react` and `eslint-plugin-jsx-a11y` declare no ESLint 10
support, so their maintained, ESLint 10 compatible counterparts are used.

## Internationalized messages

The i18n scope turns on when `react-intl` or `@formatjs/intl` is in `dependencies` or
`devDependencies` of the head checkout (a peer dependency alone does not count, as with React), or
when `nitpicker.config.json` sets `"i18n": { "enabled": true }`; `"enabled": false` turns it off
whatever `package.json` says. The decision is made once, from the head checkout, and both sides of
the comparison use it, so a pull request that adds the library does not turn every existing literal
into a new finding; the React scope is decided the same way. It is independent of the React scope.
It covers production source under the source roots, not test files or story files
(`*.stories.*`, `*.story.*`, which hold literal arguments on purpose), and runs
`eslint-plugin-formatjs`. Its dependency tree is permissive: MIT throughout, Apache-2.0 for
TypeScript, and `jsonify` (through `json-stable-stringify`), which is public domain.

Projects that wrap the library name the wrappers: `i18n.functionNames` (functions called like
`formatMessage`) and `i18n.componentNames` (components used like `FormattedMessage`) are passed to
the plugin as `additionalFunctionNames` and `additionalComponentNames`, so their messages are
checked too. `formatMessage`, `$t`, `defineMessage(s)` and `FormattedMessage` are always checked.

Each rule names the allowed form in its message and says to add an exception for the rule in
`nitpicker.config.json` where it can flag legitimate code. An exception that names an i18n rule is
skipped while the scope is off; one that names an i18n rule nitpicker does not run (such as
`formatjs/enforce-id`) is a config error. The rules never autofix, because the message text and the
description are for a person to write. Both lint engines report the same findings: a message that
cannot be parsed is reported once, by `formatjs/no-invalid-icu` (the other rules that parse
messages stay silent about it, and it honours a per-call `ignoreTag: true`), and a rule reports at
most once per node.

On, because each blocks a message that is wrong at runtime or breaks in translation, and the
allowed form is clear:

- **A literal default message** (`formatjs/enforce-default-message`, `literal`). The text is a
  non-empty string literal. It is the fallback shown when a translation is missing and the source
  the extraction workflow collects; a message with only an `id` shows its raw key and cannot be
  extracted. A variable or a template with substitutions is flagged, and a message built elsewhere
  on purpose needs an exception for the rule.
- **A translator description** (`formatjs/enforce-description`, `literal`). Every message says, as
  a non-empty string literal, where it appears and what it does, as in
  `description: 'Button that saves the profile form'`: an ambiguous label such as "Save" or "Book"
  cannot be translated without it.
- **No untranslated text in JSX** (`formatjs/no-literal-string-in-jsx`). Literal text children are
  flagged on any element, and so are attributes: `aria-label`, `aria-description`, `aria-details`
  and `aria-errormessage` on every tag, `placeholder` and `title` on lowercase intrinsic tags
  (`<input>`, not `<Field>`), and `alt` on `<img>`. Text with no letter in it (a space written
  `{' '}`, `-`, `/`, a number, `&nbsp;` and other symbol entities) is not flagged. It is the
  largest adoption step, since an existing screen is full of literals, but the gate fails only the
  literals a change adds (an existing one stays baselined), so a codebase moves screen by screen.
  Text that is not translated (a brand name, code) needs an exception for the rule, or the scope
  off for a project that is not translated yet.
- **Placeholders match their values** (`formatjs/enforce-placeholders`). A placeholder without a
  value throws when the message is formatted; a value the message never uses is dead. Values that
  are not an object literal (`values={extra}`, `formatMessage(d, extra)`) are trusted.
- **Valid ICU syntax** (`formatjs/no-invalid-icu`): unbalanced braces, a `plural` or `select`
  without `other`.
- **`#` in plurals** (`formatjs/prefer-pound-in-plural`,
  `formatjs/no-missing-icu-plural-one-placeholders`). `one {# item}`, not `one {{n} item}` (the
  argument is not formatted for the locale) or `one {1 item}` (some languages use `one` for other
  numbers).
- **Messages translators can handle**: no `offset:` (`formatjs/no-offset`), one plural per message
  (`formatjs/no-multiple-plurals`), at most 20 sentences once nested selectors are flattened
  (`formatjs/no-complex-selectors`), no consecutive spaces (`formatjs/no-multiple-whitespaces`).
- **Whole sentences** (`formatjs/prefer-full-sentence`). No leading or trailing whitespace, which
  means a sentence assembled from pieces, and no placeholder glued to a word or unit (`{n}MB`; use
  `{n, number, ::unit/megabyte}`). A message in Chinese, Japanese, Korean, Thai, Lao, Khmer or
  Burmese may join a placeholder to a word, since those scripts have no spaces.
- **No message that only formats a value** (`formatjs/no-useless-message`): `{n, number}` alone is
  `FormattedNumber`, `{d, date}` is `FormattedDate`.

Off, with the reason:

- `formatjs/enforce-id` and `formatjs/no-id`: opposite answers to one project choice (generated ids
  with a configured interpolation pattern, or hand-written ids), and `enforce-id` cannot run without
  the project's own pattern. Both are equally valid, so neither is on.
- `formatjs/enforce-plural-rules`: which categories a message must list depends on the language
  of the source text (`one` is wrong for a Japanese source). The parser already requires `other`.
- `formatjs/blocklist-elements`: it does nothing without a list of elements to block, and that
  list (`selectordinal`, `select` on gender) is a project policy.
- `formatjs/no-camel-case`: the placeholder naming style (`userName` or `user_name`) is a convention.
- `formatjs/no-emoji`: whether a product's messages carry emoji is a design decision.
- `formatjs/prefer-formatted-message`: `intl.formatMessage` in JSX children and `<FormattedMessage>`
  are both valid.
- `formatjs/no-literal-string-in-object`: it flags any `label` property in any object (a chart
  option, a fixture), which is a guess about names, not a pattern that is wrong.
- `formatjs/enforce-message-types`: without its type generation option it repeats
  `enforce-placeholders`, so every missing value would be reported twice.

## No prop, option or export without a caller

New public surface that nothing uses is rejected in review, so it is a check. A finding names the
symbol (`Button.tone`, `useFetch.timeout`, an export's name) and fails only when the change adds it,
or removes the last caller that used it. Each message names the allowed form (remove it, or use it
from a real caller) and the `exceptions` entry that lifts it.

- **Unused props** (`unused-prop`, React scope only). A prop that a component's props type declares
  in the project's own files (a type literal, interface or alias, through intersections, `Pick`,
  `Omit` and `Partial`) and that no caller passes. Members that come from a library type
  (`ButtonHTMLAttributes`, `PropsWithChildren`) are not checked. A caller passes a prop with a JSX
  attribute, a spread of an object literal, or the props object of `createElement` and the JSX
  runtime calls; `children` is passed by JSX children. A spread of anything else
  (`{...rest}`) passes every prop. Keys of `X.defaultProps` count as passed, and so do the props
  that any `cloneElement` call sets, for every component (a `cloneElement` whose props are not an
  object literal passes every prop of every component). Components are found as function
  declarations and `const` functions in `.tsx` files, also inside `memo` and `forwardRef`, and
  callers are found through imports, aliases, namespaces and barrels. A component that nothing
  renders is not judged.
- **Unused options** (`unused-option`). A property of the options parameter of an exported function
  that no call sets. The parameter is the one named `options`, `opts`, `config`, `settings`,
  `params`, `args`, typed `...Options`, `...Opts`, `...Config` or `...Settings`, or destructured in
  the signature. A call sets the properties of its object-literal argument; any other argument, or a
  spread before it, sets all of them. A function nothing calls is not judged.
- **Only the type of one component or function.** A props or options type that several
  declarations use (a domain type such as `Rect` or `User`, a shared `PluginOptions`) is not judged:
  each of them may read a different subset of it. A parameter typed by a type parameter is not
  judged either.
- **Exports and modules only tests import** (`test-only-export`). Reported by the `dead-code` check
  from knip itself: a second knip run with the normal config minus test and story files, test
  entries and test-runner plugins (scripts in `package.json`, tool configs such as
  `vite.config.ts`, `bin` and `exports` stay entries) lists what production code does not use, and
  what the normal run does not list is used only by tests. That covers whole modules too: a module
  that only tests import should move to a `test-support/` folder, and modules under `test-support/`
  are not reported. A re-export (`export { x } from`, `export * from`, `export * as ns from`, an import that is only
  exported again, or `export const y = x` for an import the file does not otherwise read, which
  `export default y`, `export { y as z }` and `export const w = y` pass onward as further aliases of
  the same import) is not a use by itself: re-exporting a function from an entry such as
  `src/main/main.ts` or a composition root does not clear the finding, and the finding names the
  re-exporting file. It counts only when something imports the name onward from the re-exporting
  module; barrels, renames and imports that are only exported again are followed to the
  declaration, and the importer at the end decides (production code counts, a test does not). A
  declaration that nothing imports, tests included, is not reported. Production that uses an
  `export * as ns` of an entry as a whole value (`use(ns)`, `Object.keys(ns)`) uses every member;
  `ns.member` uses only that member. Entries are found by the same walk as the rest of the project,
  so a file in a dot, `dist`, `build`, `generated` or `node_modules` directory, a symlink or a
  declaration file is not an entry here either. Exceptions: a re-export from a
  public entry of a published package (see below), a re-export from a file listed in
  `layout.entryPoints` (a handler, worker or plugin config that a host loads instead of importing
  it), and what a framework plugin consumes from an entry. An entry that spreads a namespace
  (`{ ...feat }`) counts as using it.
- **Callers the check cannot see.** A component or function that is used as a value (passed as
  `component={X}`, put in a route or config object, `.call`ed, mapped over, assigned) is left alone,
  as are all exports of a module that is loaded with `import()` or `require()` (`lazy`, route
  loaders) or used as a namespace value. An `import()` of a template literal leaves every module
  under its static prefix alone (``import(`./pages/${name}`)``), and `import.meta.glob` every
  module it matches. Generated files (`@generated`, "do not edit" in the first lines), declaration
  files, and test, story and `test-support/` files do not declare checked props. JavaScript files,
  root tool configs (`vite.config.ts`) and `scripts/` count as callers even when the `tsconfig`
  does not include them.
- **Private and published packages.** A package is published when its `package.json` has a name,
  no `"private": true`, and says what it ships (`main`, `exports`, `bin`, `files` or
  `publishConfig`); it can have callers outside the repository. Its own tests, stories and examples
  count as callers, so a new public prop or option must at least be exercised there, and its
  `test-only-export` findings are not reported, and a re-export from its public entries (the files
  that `main`, `module`, `types`, `typings`, `source` and `exports` of its `package.json` name, or
  else its source-root `index`, and the files that `layout.entryPoints` lists) counts as a use of
  what it re-exports, wherever that is declared. In any other package, or an app whose manifest has
  no name, only production callers count: a prop that only a test or story passes fails. Callers
  in the other packages of an npm, Yarn or pnpm workspace count for the package that declares the
  prop; a package name resolves to the source file its `package.json` names, or else to the
  `index` of a source root, and `name/*` resolves into the source roots.
- **Failures.** A `tsconfig` that TypeScript cannot read, or any other failure of the check, is a
  tool error of `structure` (or of `dead-code` for the second knip run); the other findings of the
  analyzer are still reported.
- Exceptions use the rule ids `unused-prop`, `unused-option` and `test-only-export` with the file
  that declares the symbol.

## How it is enforced

- `languages/typescript/preset/defaults/eslint.config.mjs` (the `eslint-lint` analyzer) adds `strictPresetConfig()` from
  `languages/typescript/preset/eslint-config/strict.mjs` to typescript-eslint's strict type-checked config. Rules that
  strict replaces are removed: `consistent-type-assertions`, `explicit-member-accessibility` and
  `no-unsafe-type-assertion` (the `as`, class and member bans cover them), and `no-explicit-any` and
  `no-non-null-assertion` are off in production code because the strict selectors report the same
  sites with a message that names the allowed form.
- `no-restricted-syntax` is one rule with one list per scope. ESLint flat config replaces a rule's
  options when several config objects match the same file, so each scope carries the complete list:
  `restrictedSyntaxByScope` in `eslint-config/strict.mjs` has `source`, `configFile`, `domain` and `adapters`, and
  the `domain` and `adapters` lists contain the `source` list plus their own selectors. Default
  exports, `null`, promise chains and the domain/ UI-framework ban left these lists for rules of
  their own (`nitpicker/no-default-export`, `nitpicker/no-null`, `nitpicker/no-promise-chain`,
  `nitpicker/no-ui-framework-in-domain`). The loop and `forEach` selectors live in
  `strict-control-flow.mjs` and are part of `source`; `domain` drops
  the loop and `forEach` ones because its own selectors report those nodes with a stricter message. Add a
  selector to the list of its scope; a test proves that a file under `features/x/domain/` gets both
  the global and the domain bans.
- The React scope lives in `languages/typescript/preset/eslint-config/react/react-scope.mjs`; see "React"
  above and `docs/internals.md`. Its rules are strict rules too (`react-rules.mjs` lists them).
- The i18n scope lives in `languages/typescript/preset/eslint-config/i18n/i18n-scope.mjs`; see
  "Internationalized messages" above and `docs/internals.md`. Its rules are strict rules too
  (`i18n-rules.mjs` lists them).
- The test rules live in `languages/typescript/preset/eslint-config/strict-tests.mjs` (`strictTestConfigFor(layout)`),
  which `strictPresetConfig()` includes. They follow the layout's test roots and are strict rules,
  so the differential gate holds touched test code to them. The test `no-restricted-syntax` list
  (`testRestrictedSyntax`) reuses the `as` selectors of `strict-escape-hatches.mjs` and the
  loop and `forEach` selectors of `strict-control-flow.mjs`, whose loop message also names
  `it.each`; promise chains in tests are `nitpicker/no-promise-chain`.
  `evals/detectors/gate-agreement.test.mjs` checks that the evaluation harness's code-shortcuts
  detector and this list report the same constructs in a test file.
- `domain/` and `adapters/` rules are scoped by the globs `<sourceRoot>/main/features/*/domain/**`
  and `<sourceRoot>/main/features/*/adapters/**`. They follow the layout's source roots.
- The boundary rules (`languages/typescript/preset/architecture/strict-boundary-rules.mjs`) are part of the default
  dependency-cruiser config used by the `dependency-architecture` analyzer.
- `no-import-outside-roots` (`languages/typescript/preset/architecture/outside-roots/`) fails production code that
  imports a project file under no source or test root. Packages, Node built-ins, `.json` files,
  `generated/` and paths in `exclude` are not counted; the other built-in output folders (`dist/`,
  `build/`, `coverage/`, `reports/`, `target/`) are, because the `dependency-architecture` analyzer
  drops only `node_modules` from the graph (`DEPENDENCY_PATH_PATTERN`) and leaves the output folders
  unfollowed but visible. Generated code is commonly imported from `generated/`, so that folder stays
  allowed. Its message names the ways out: move the file under a source root or add its folder to
  `layout.sourceRoots`; to leave it unchecked, list it in `exclude`.
- `src/main/composition-root.{ts,mts,js,mjs}` and `src/main/composition-root/index.*` are knip entry
  points, since nothing imports the composition root.
- Touched code is enforced by the diff engine (see "How touched code is detected").
- Exceptions go through `exceptions` in `nitpicker.config.json`. An exception names one rule id and
  turns that rule off for the listed paths. For a dependency-cruiser boundary rule (the `domain-*`
  rules, for example `domain-does-not-import-node-io`), the rule id is the rule's name and the paths
  are the importing files. `no-restricted-syntax` is a single rule id, so an
  exception for it lifts every selector (all the syntax bans) for those paths; prefer fixing the
  code, and keep such exceptions narrow. The bans that frameworks and libraries legitimately need
  lifted have their own rule ids, `nitpicker/no-default-export`, `nitpicker/no-null` and
  `nitpicker/no-promise-chain`, built from the same `{ selector, message }` lists, so an exception
  for one of them leaves the other bans on.
- Upgrade note: these three bans, and the UI framework ban in `domain/`
  (`nitpicker/no-ui-framework-in-domain`), used to be `no-restricted-syntax` selectors. An existing
  `no-restricted-syntax` exception no longer lifts them; add an entry for the new rule id with the
  same paths.
- The rules nitpicker adds are not ESLint rules, but the same `exceptions` key accepts them:
  `file-lines-limit`, `line-length-limit`, `folder-files-limit`, `function-lines-limit`,
  `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`,
  `folder-depth-limit`, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`, `mutant-survived`,
  `mutant-nocoverage`, `stability-direction`, and the dead-code findings `files`,
  `exports` and `types`, plus the reuse rules (`shared-used-by-one-feature`, `duplicate-definition`,
  `sibling-copy-edit`, `exported-name-collision`, `redefined-library-component`, `new-icon-asset`),
  the unused-API rules and `component-story-missing`, which come from the `coupling` and `structure` checks, not from
  ESLint; the JavaScript preset runs them too. The structure, CRAP and coverage rules take an optional `function`
  (required for `changed-branch-coverage`) that limits the entry to one function. The message of
  each finding prints the entry. See [Exceptions for rules nitpicker adds](usage.md#exceptions-for-rules-nitpicker-adds).
- `folder-depth-limit`: code may sit at most one folder below `features/<feature>/<layer>/` (a file in
  `domain/orders/x.ts` is fine, one in `domain/orders/rules/x.ts` is not), so nesting cannot dodge
  the 6-files-per-folder limit. `thresholds.folderDepth` changes the one folder. `__tests__` and `__mocks__` folders do not
  count as a level. A folder already deeper on the base fails only when it gets deeper, and the rule takes exceptions like the file
  limits.
- The reuse rules (`shared-used-by-one-feature`, `duplicate-definition`, `sibling-copy-edit`,
  `exported-name-collision`, `redefined-library-component`, `new-icon-asset`) come from the
  `coupling` and `structure` checks, not from ESLint, and take exceptions the same way; the
  JavaScript preset runs them too.
- `layout.sharedRoots` and `layout.featureRoots` (folder globs, default `<sourceRoot>/main/shared` and
  `<sourceRoot>/main/features`) change which folders `shared-used-by-one-feature` treats as shared and
  as features; `[]` in `featureRoots` turns it off. The ESLint boundary rules keep the default layout.
- `layout.excludedGlobs`, `layout.entryPoints` and `layout.sourceRoots`/`layout.testRoots` are all valid `layout` keys. The
  default `testRoots` are `test`, `tests`, `__tests__` and `e2e` (repo-root folders only, so
  `src/crypto/e2e/` stays production code; a missing one is ignored). Type checking, duplicate
  detection, dead-code analysis and the test-file lint scopes cover all four. The roots must be
  directories; `excludedGlobs` are globs and replace the built-in exclusions;
  `entryPoints` are globs added to knip's entries for files that are loaded by path, not imported (what
  they re-export is not reported as `test-only-export`);
  the module-load-effects check does not apply to them, since running at load is what a script does.
- A root `e2e/` of Playwright or Cypress specs needs no exception. Its specs need no production
  import (`nitpicker/test-must-use-production-runtime` and the `test-runtime` analysis skip it, as
  they skip `contract/`), `async ({}, use)` fixtures are allowed there, and the folder is never
  mutated. The type check adds the DOM lib when the folder exists, so `document` and `window` inside
  `page.evaluate` compile (the lib then applies to every file in that check). The default quality
  test run does not run `e2e`, since end-to-end runners start those tests themselves; a `testRoots`
  you list yourself is always run, so list `e2e` to keep a vitest or supertest suite there.
- A Jest project with tests in a root `__tests__/` gets them run by Jest in the quality test run,
  like every other test file (see [Test runners](usage.md#test-runners)).

## Enforcement sources

typescript-eslint (strict type-checked), `eslint-plugin-functional` scoped to `domain/`,
`no-restricted-syntax` selectors, nitpicker's custom rules, and dependency-cruiser for the layout
and boundary rules. `eslint-plugin-unicorn` is a candidate source.

## Open points

- Resolved: the default composition-root pattern of
  `no-managed-resource-construction-outside-composition-roots` is now only `main.ts`, `server.ts`
  and `composition-root.ts`; `*factory*.ts` no longer qualifies. The `compositionRootPattern` option
  extends these defaults and cannot replace them, so a project adds roots but cannot drop the
  defaults. The `no-module-level-let` rule has no exemption, including for composition roots.
- Whether nitpicker's own code must follow the preset. Today its engine uses banned forms, such as
  `while (pending.pop())` graph walks.

## Decisions

Status: Proposed, pending owner review. Each answer is a recommendation for the owner to accept or
change in review.

### zod: peer dependency or documented expectation

Recommendation: documented expectation, not a peer dependency.

The preset only requires that adapter code parse untrusted input with a schema library, and zod is
the default. Nitpicker's own runtime never imports zod (it is not in `package.json`), so a peer
dependency would make every consumer install a package nitpicker does not use, and would break
installs for projects that choose to have no external-input boundary. The rule that checks this
works on syntax (a hand-written type guard on external data, an unparsed `JSON.parse`) and on which
calls count as a parse, not on importing the library. Document in the preset README that adapters
are expected to use zod unless the project has another validation library, and have the rule
message name the project's library, or zod when it has none (see "Libraries follow the project").
Revisit as a peer dependency (optional, via `peerDependenciesMeta`) only if a rule needs to import
from zod at lint time.

### Does nitpicker's own code follow the preset

Recommendation: not now. Follow the preset for new nitpicker code only after the port is complete,
and do not rewrite the engine.

Measured cost, from `core` and `languages/typescript/preset` (non-test `.mjs`, about 7,300 lines):
the engine uses `let`, `for` loops and `while (pending.pop())` graph walks in roughly 180 places,
classes are rare, and the code is plain `.mjs` without TypeScript, so the type-based rules (`as`,
`any`, discriminated-union exhaustiveness) cannot apply at all. Porting it would be a large rewrite
with no user-visible benefit, and graph walks written without loops or recursion are harder to read.
Applied in S13: nitpicker's own sources are not rewritten and no config is added for them. A cheaper and honest path is the one the differential gate already provides: run nitpicker on
itself, with existing violations baselined, so any new or touched engine code must comply once the
preset runs on TypeScript sources. The layout (`src/main/features/...`) does not match the current
`core/` and `languages/typescript/preset/` directories, so the repo needs either a layout override (an exception in its
own config, visible in the report) or a move; choose the override until the engine is TypeScript.

### How existing consumers upgrade

Recommendation: strict replaces the current rules in a single release, adopted through the baseline.

1. Ship the strict preset as a new major version, with a changelog listing every rule that fails.
2. The policy hash changes with the preset. The gate analyzes both the base worktree and the head
   (`core/diff/comparison/run-diff.mjs`), so existing violations appear on both sides and are baselined, not
   failed. The upgrade PR itself should be verified once to confirm the base side is analyzed with
   the new rules (checked in S13: the base side is analyzed with the head's policy, and a test shows a legacy
   violation staying baselined when the edit is elsewhere in the file).
3. Violations in files a PR does not touch stay baselined and never block it. Violations in touched
   code are enforced (see the next decision), so adoption is gradual and driven by ordinary edits.
4. Teams that cannot adopt a rule yet add an exception in the nitpicker config file, which changes
   the policy hash and appears in the report. There is no separate "legacy" preset.

### How touched code is detected and held to strict rules

Today the gate classifies a finding as new only when its comparison key is missing from the base.
The key (`core/diff/comparison/fingerprint.mjs`) is tool, rule, rename-mapped path, symbol,
identity, classification and metric name. It contains no line number, so an existing violation in an
edited file keeps matching the base and stays baselined. That is the behavior to change for strict.

Recommendation: line-hunk promotion, implemented in the diff engine (folded into S13 and
implemented there: `readChangedLines` in `core/diff/git/repository/git.mjs`, applied by `compareFindings` in
`core/diff/comparison/compare.mjs`, with the rule set from `languages/typescript/preset/strict-rules.mjs`).

- Compute the changed line ranges of each file on the head side from
  `git diff --unified=0 --find-renames <base>...HEAD` (the engine already shells out to git in
  `core/diff/git/repository/git.mjs` for renames; hunk headers `@@ -a,b +c,d @@` give the head ranges `c..c+d-1`).
- After `compareFindings`, move a finding from `unchangedFindings` to `newFindings` when its rule
  is in the strict set and its head `location.line` falls inside a changed range of its file.
  Findings with no `location` (file- or graph-level findings) are promoted only when the file is
  newly added, not merely edited, to avoid blocking on whole-file metrics.
- A pure rename or move without content changes has no hunks, so rename-stable fingerprints still
  baseline it. A reformat that touches every line promotes everything in the file; that is
  acceptable, since reformatting is a touch, and it matches how the line-based tools below behave.
- Scope is rule-level, not tool-wide: only rules marked `strict` in the preset promote, so
  descriptive metrics (CRAP, duplication) keep their delta logic.

Edited legacy lines are judged "only if worse". A strict finding inside a named function carries a
count ratchet (how many times its rule and message fire in that function). When such a finding sits
on a line the change edited but did not add (the first lines of a hunk, up to the number of lines it
replaced), it is not promoted: it stays baselined while the function has no more of that violation
than on the base, and fails once the count rises. Lines the change added, and every line of a new
file, stay fully strict. Formatting is the exception: `prettier/prettier` is strict on every edited
line (`mustMeetOnEditedLines` in `strict-rules.mjs`).
A finding that fails in a function whose base already had findings of the same rule and kind can carry
`ratchet.growthAdvice`; the report appends it to the message with `{base}` replaced by the base count.
`nitpicker/no-throw` uses it to say a new failure can go through an existing throw statement.

Prettier findings use the same promotion: the formatter reports one finding per differing region
(identity from the region's own text, `location.line` to `location.endLine` in the head file), and
`isStrictRule` includes `prettier/prettier`, so a legacy unformatted region stays baselined until an
edit overlaps it.

Rejected alternatives: whole-file promotion (a one-line edit in a large legacy file would force a
large cleanup and discourage small fixes); function-level promotion using symbols (more precise but
requires every analyzer to report symbol ranges, which they do not today). Function-level can replace
hunk-level later behind the same interface if line hunks prove too coarse.
