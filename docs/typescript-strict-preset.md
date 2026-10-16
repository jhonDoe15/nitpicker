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
  architecture's folder names. It may not import `adapters/`, Node I/O modules, network or database
  clients, the logger, or module state. Time, IDs, and randomness arrive as parameters.
- `features/<name>/adapters/` performs I/O and calls `domain/`. A feature with no I/O has no
  `adapters/` folder.
- Shared code does not import features. Features do not import the composition root. Import cycles
  are not allowed.
- Objects are constructed only in the composition root. Dependencies are passed explicitly. No
  module-level `let`.
- `nitpicker/no-branch-in-composition-root`: the composition root (`composition-root.ts`, `main.ts`,
  `server.ts`, plus the `compositionRootPattern` option shared with
  `no-managed-resource-construction-outside-composition-roots`) only wires features with named
  functions that pass things in. It reports `if`, `?:`, `switch`, `??` and optional chaining (`?.`),
  inside functions and at module level, except the main guard (an `if` whose condition uses
  `import.meta` or `require.main`, as for `no-process-globals-outside-main-guard`) and branches in its
  condition. `&&` and `||` are not reported. A lookup or missing-value
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
- No classes and no `this`.
- Expected failures are returned as discriminated unions, never thrown. TypeScript has no checked
  exceptions, so a result type is the only way the compiler forces every caller to handle a new
  failure case, which is the gate steering the author. It also keeps `domain/` pure. The cost is
  unwrapping at call sites and converting library exceptions at the adapter boundary.
- Illegal states are made unrepresentable with discriminated unions.
- `nitpicker/no-unknown-in-domain`: no `unknown` in a parameter or property type (including inside
  `readonly unknown[]`, `Record<string, unknown>` and index signatures). `domain/` receives values
  already parsed and typed; the zod schema that parses untrusted input lives in `adapters/`, and
  `domain/` types the value as `z.infer<typeof schema>` or a hand-written type. `unknown` as a
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

## Inside `adapters/`

- Throw only for unexpected failures, using `Error` subclasses that preserve `cause`. Convert
  library exceptions into domain results at the boundary.
- `nitpicker/no-silent-catch`: a `catch` must hand the failure on. It passes when it uses the
  caught value (rethrow an `Error` subclass with `{ cause: error }`, log it, or return it in a
  result) or when it returns a failure result object (`catch { return { kind: 'malformed-json' } }`).
  Carry the caught value only where something reads it; a field added just so the binding is read
  is slop. A `catch` that falls through, or returns a non-object such as `undefined` or `[]`, is
  reported. A deliberately dropped error needs an exception in the config file.
- `nitpicker/no-unvalidated-schema-field` (all production code): no `z.unknown()` or `z.any()`
  (also with `.optional()`, `.nullable()`, `.default()` and similar wrappers) as a field of
  `z.object`, `z.strictObject` or `z.looseObject`. A schema that only checks the shape hands the
  field on unchecked, and `domain/` then re-validates it by hand. Validate the field in the schema
  (`z.string().trim().min(1)`, `z.email()`). `z.array(z.unknown())` or `z.unknown()` as a whole
  schema, and `z.unknown().refine(...)`/`.pipe(...)`, are not reported.
- Untrusted input is parsed once, at the boundary, with zod. Hand-written type guards for external
  data are not allowed.

## Everywhere

- `nitpicker/no-self-recursion`: no function that calls itself, in all production code (`domain/`,
  `adapters/`, the composition root and shared code), not in tests. Allowed forms: a retry or poll
  is a `for...of` over attempt numbers with `await` inside the loop; a tree walk (directories, AST,
  JSON) is a `for...of` over a worklist that each step pushes the node's children onto
  (`for (const node of pending) { pending.push(...children) }`); flat data uses `map`, `filter`,
  `flatMap` or `Object.fromEntries`. `domain/` has no loops, so a walk there uses `map`/`flatMap` or
  moves to `adapters/`.
- `for...of` is the only loop, in all production code (not just `adapters/`). No `forEach`,
  `for(;;)`, `for...in`, `while`, or `do...while`. `domain/` is stricter and has no loops at all.
- `async`/`await` and `Promise.all`. No `.then()`, `.catch()` or `.finally()` chains, and no promise
  left without being awaited (`@typescript-eslint/no-floating-promises`).
- `===` and `!==` only (`eqeqeq`).
- Cognitive complexity of at most 15 per function, tests included (`nitpicker/cognitive-complexity`).
  Each `if`, ternary, `switch`, loop and `catch` costs 1 plus its nesting level; `else`, `else if`,
  labelled `break`/`continue` and each run of like `&&`/`||` cost 1. Unlike the published algorithm,
  every function, callbacks included, is scored on its own with nesting starting at 0, and code
  outside any function is not scored. A function that must stay complex gets an exception for the
  rule in `nitpicker.config.json`.
- Config files are exempt from the loop, `forEach` and promise-chain bans; `eqeqeq` still applies.
- Named functions use the `function` keyword; arrow functions only as callbacks.
- `type`, never `interface`, except in a `declare module` or `declare global` augmentation, which
  can only merge interfaces. No `enum` (use unions of string literals) and no `namespace`.
- Classes only for `Error` subclasses.
- Named exports only; config files are exempt.
- Early returns; no `else` after a `return`; no nested ternaries.
- A `switch` over a discriminated union must handle every case.
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
  gets a reviewed exception for that rule in `nitpicker.config.json`.

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
  `scheduler.wait(n)`. Wait on a condition with `vi.waitFor` or `expect.poll`.
- `nitpicker/no-raised-test-timeout`: no test, suite or hook timeout above 10 000 ms. That is the
  `testTimeout` nitpicker runs a project's tests with (`languages/typescript/preset/defaults/vitest.quality.config.ts`, which
  Stryker also uses, and the coverage runner's `--testTimeout`; a test keeps them in step).
  The rule covers the third argument of `it`/`test`, `{ timeout }` options, hook timeouts and
  `vi.setConfig`. A timeout that is not a constant written in the file is also reported. There is
  no e2e exemption; a genuinely long suite needs an exception in the config file.
- `nitpicker/no-first-test-charged-setup`: no lazily memoized shared setup that tests reach. It
  reports a call whose value is stored in a module-level `let`/`var` only while that variable is
  empty (`x ??= expensive()`, `x ||= call()`, `x = x ?? call()`, `if (!x) x = call()`,
  `if (x === undefined) { x = call() }`, or `if (x) return x; x = call()`), when an `it`/`test`
  body or `beforeEach` runs it, directly or through same-file helpers. The first test to run pays
  for the setup, reports show that test as slow, and test order matters. Compute it in
  `beforeAll`. Constants, `new` expressions and calls on `path`, `Math`, `Object`, `JSON` and
  similar built-ins are not reported. A deliberate memo needs an exception in the config file.
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
  case), `forEach`, `.then()`/`.catch()`/`.finally()` chains, `as` (except `as const`) and
  `<Type>value`. `any` and non-null `!` are already reported in test files by
  typescript-eslint's `no-explicit-any` and `no-non-null-assertion`. Like the other bans, these are
  strict rules: a finding on a line a change edits, or in a new test file, fails the run. An exception for
  `no-restricted-syntax` lifts all the syntax bans for those paths.
- `vitest/no-conditional-in-test` is enabled for test files: no `if`, ternary or `&&`/`||` branching
  inside a test body. Give each outcome its own `it.each` table row instead of branching on it.
- The vitest config nitpicker runs tests with (`defaults/vitest.quality.config.ts`, used for
  coverage and mutation) sets `restoreMocks: true`, so a `vi.spyOn` spy is restored after every test
  even when an assertion fails, and cannot leak into the next test. It also overrides a
  `restoreMocks` value in the project's own vitest config for these runs. Vitest has no option that
  restores fake timers automatically: call `vi.useRealTimers()` in `afterEach`.

Left out, from the same write-up: recomputing one expensive result in every test, and running the
whole pipeline to check a decision made earlier. Both need a heuristic (repeated constant arguments
across tests, or what an assertion depends on), so a finding would not reliably mean a slow test.
Vitest's worker count in CI is a CI setting, not code. It belongs in the CI workflow or in a check
of the project's CI files, not in these rules. That check would need its own analyzer (a runner
kind, a version entry, a check definition and project-level findings) and is not built yet.

## React

The React scope turns on when `react` is in the analyzed project's `dependencies` or
`devDependencies` (a peer dependency alone does not count), or when `nitpicker.config.json` sets
`"react": { "enabled": true }`; `"enabled": false` turns it off whatever `package.json` says. A
project without React gets none of the rules below and no change to the rules above. The scope covers
production source under the source roots (every extension the preset lints, `.jsx` included); the test rules at the
end of this list cover test files. Each rule names the allowed form in its message and, where it can flag legitimate code, says
to add an exception for the rule in `nitpicker.config.json`. An exception that names a React rule is skipped while the scope is
off (a PR that adds or removes React keeps linting on both sides); a misspelled rule is still an error.

- **Function components only** (`react-x/no-class-component`). Class components are flagged; error
  boundaries, which React only supports as classes, are allowed. The "classes only for `Error`
  subclasses" ban leaves classes that extend `Component` or `PureComponent` to this rule in a React
  project, so each class gets one message.
- **Rules of hooks and exhaustive dependencies** (`react-hooks/rules-of-hooks`,
  `react-hooks/exhaustive-deps`), both as errors. A dependency that is left out on purpose needs an
  exception for `react-hooks/exhaustive-deps`.
- **No derived state in effects** (`nitpicker/react-no-effect-derived-state`). A state setter called
  in the body of a `useEffect` or `useLayoutEffect` callback, whose dependency array is not `[]`, is
  flagged: compute the value during render (`useMemo` when it is costly) or reset state with a `key`.
  The hooks are resolved through their `react` import (`import { useEffect as onEffect }` and
  `import * as R from 'react'` count; a hook of the same name from another module does not), and
  the setter can be `const [x, setX] = useState()` or `useState()[1]` kept in a variable. A function
  declared in the effect body and called there synchronously counts as the body. Setters called from
  other nested callbacks (a subscription, an event handler, `.then`, after an `await`) are not
  flagged, and neither is `[]` (the mounted-flag pattern) or a function declared outside the effect.
  Subscribing to an external store (`matchMedia`) is better written with `useSyncExternalStore`;
  measuring the DOM in `useLayoutEffect` is the usual legitimate exception.
- **No data fetching in effects** (`nitpicker/react-no-effect-data-fetching`). `fetch` (also
  `window.fetch` and `globalThis.fetch`), `axios`, `ky` and `new XMLHttpRequest` anywhere inside an
  effect callback are flagged: use a data-fetching library (TanStack Query `useQuery`, SWR
  `useSWR`) or the framework (a route loader, a Server Component). The check is by name: wrappers
  (`api.get`, `got`, `$.ajax`), aliased imports (`import http from 'axios'`) and a function declared
  outside the effect and only called inside it are not followed.
- **No array index as `key`** (`react-x/no-array-index-key`): use a stable id from the item.
- **One styling approach** (`nitpicker/react-single-styling-approach`), chosen with
  `react.styling`: `class-names` (`className` with CSS Modules, plain stylesheets or utility
  classes; inline `style` objects and CSS-in-JS libraries are flagged), `css-in-js` (styled-components,
  Emotion, Stitches, goober, Linaria; stylesheet imports and inline `style` objects are flagged) or
  `inline-style` (`style` objects; stylesheet imports and CSS-in-JS libraries are flagged). Unset,
  the approach is `css-in-js` when `package.json` lists one of those libraries, else `class-names`.
  A `style` object is flagged when it is written inline, bound to a `const` in the same file,
  or reached through `?:`, `&&`, `??`, `satisfies` or `as`; `css=` and `sx=` props and `style` inside
  spread props are not checked. A `style` object whose keys are all CSS custom properties
  (`'--progress': percent`) is allowed, as is a `style` value that is not an object literal
  (`style={style}`), so a runtime value reaches class-based CSS. Type the custom property once,
  in any module: `declare module 'csstype' { interface Properties { '--progress'?: number } }`
  (needs `csstype` installed; `interface` is allowed in that augmentation). This is the default
  because inline `style` objects are the usual agent slop.
- **Accessibility** (`jsx-a11y/*`): the recommended `eslint-plugin-jsx-a11y` rule set, as errors.
- **`null` for refs and contexts.** `null` stays banned, except as the argument and the type
  argument of `useRef` and `createContext` (`useRef<HTMLDivElement>(null)`,
  `createContext<Theme | null>(null)`), where React's types need it.
- `@typescript-eslint/no-misused-promises` stops flagging `async` event handlers in JSX attributes
  (`onClick={async () => ...}`), which is the normal React form.
- **Component tests** (test files only: the test roots, `*.test.*` and `*.spec.*` files under the
  source roots, and `__tests__` directories). They need no particular test runner (Vitest or
  Jest), and report only in a test file that imports `@testing-library/*`, `react`, `react-dom`
  or another `react-*` package, `enzyme`, `react-test-renderer`, or a relative `test-utils`
  module, so Playwright and domain tests in the same roots are left alone. Query by accessible
  role, not test ids (`testing-library/no-test-id-queries`) or DOM traversal, class selectors and
  `container` queries (`testing-library/no-node-access`): `screen.getByRole('button', { name: 'Save' })`,
  or `toHaveFocus()` for focus. Drive the component with `userEvent`, not `fireEvent`
  (`testing-library/prefer-user-event`), and `await` every `userEvent` call, `findBy*` query and
  `waitFor` (`testing-library/await-async-events`, `await-async-queries`, `await-async-utils`);
  a project on user-event v13, whose calls are synchronous, needs an exception for
  `await-async-events`. Do not test implementation details
  (`nitpicker/react-test-no-implementation-details`): no `.instance()`, `.state()`, `.setState()` or
  test-renderer `findByType`/`findByProps`, no React fiber internals (`_reactInternals`,
  `stateNode`, `memoizedState`) and no `spyOn(React, 'useState')`; assert what the user sees. An
  element with no role or accessible name needs an exception. A project with
  `@testing-library/react-native` keeps `testID` queries, the idiom there.

The plugins are `eslint-plugin-react-hooks`, `eslint-plugin-react-x` (from eslint-react),
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
  the `domain` and `adapters` lists contain the `source` list plus their own selectors. The
  control-flow selectors live in `strict-control-flow.mjs` and are part of `source`; `domain` drops
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
  control-flow selectors of `strict-control-flow.mjs`, whose loop message also names `it.each`.
  `evals/detectors/gate-agreement.test.mjs` checks that the evaluation harness's code-shortcuts
  detector and this list report the same constructs in a test file.
- `domain/` and `adapters/` rules are scoped by the globs `<sourceRoot>/main/features/*/domain/**`
  and `<sourceRoot>/main/features/*/adapters/**`. They follow the layout's source roots.
- The boundary rules (`languages/typescript/preset/architecture/strict-boundary-rules.mjs`) are part of the default
  dependency-cruiser config used by the `dependency-architecture` analyzer.
- `src/main/composition-root.{ts,mts,js,mjs}` and `src/main/composition-root/index.*` are knip entry
  points, since nothing imports the composition root.
- Touched code is enforced by the diff engine (see "How touched code is detected").
- Exceptions go through `exceptions` in `nitpicker.config.json`. An exception names one rule id and
  turns that rule off for the listed paths. `no-restricted-syntax` is a single rule id, so an
  exception for it lifts every selector (all the syntax bans) for those paths; prefer fixing the
  code, and keep such exceptions narrow.
- The file limits (`file-lines-limit`, `line-length-limit`, `folder-files-limit`) take exceptions the
  same way; each failure message spells out the entry that would lift it.
- `layout.excludedGlobs`, `layout.entryPoints` and `layout.sourceRoots`/`layout.testRoots` are all valid `layout` keys. The
  roots must be directories; `excludedGlobs` are globs and replace the built-in exclusions;
  `entryPoints` are globs added to knip's entries for files that are loaded by path, not imported;
  the module-load-effects check does not apply to them, since running at load is what a script does.

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

The preset only requires that adapter code parse untrusted input with zod. Nitpicker's own runtime
never imports zod (it is not in `package.json`), so a peer dependency would make every
consumer install a package nitpicker does not use, and would break installs for projects that
choose to have no external-input boundary. The `strict` ESLint rule that would check this works on
syntax (a hand-written type guard on external data), not on which library parses it. Document in the
preset README that adapters are expected to use zod, and have the rule message name zod as the
allowed form. Revisit as a peer dependency (optional, via `peerDependenciesMeta`) only if a rule
needs to import from zod at lint time.

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
