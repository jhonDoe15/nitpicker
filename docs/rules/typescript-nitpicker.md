# TypeScript and JavaScript: nitpicker ESLint rules

The ESLint rules nitpicker's own plugin adds to the TypeScript and JavaScript presets (`nitpicker/*`). This page lists 88 rules. [All pages](README.md).

The guide for these rules: [docs/typescript-strict-preset.md](../typescript-strict-preset.md).

Unless an entry says otherwise:

- **Presets:** TypeScript and JavaScript
- **Analyzers:** `eslint-lint`
- **Why it is on:** One of nitpicker's own ESLint rules. Each names one allowed form of something TypeScript allows several ways, or a defect, and its message says how to fix it.

<a id="eslint-nitpicker-bounded-container-teardown"></a>

### `eslint/nitpicker/bounded-container-teardown`

Stop containers through teardownContainer rather than directly in teardown hooks.

- **Printed as:** `eslint-lint/nitpicker/bounded-container-teardown`
- **Exception:** If this is intended, add `{"rule":"nitpicker/bounded-container-teardown","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Stop containers through teardownContainer rather than directly in teardown hooks.

<a id="eslint-nitpicker-cognitive-complexity"></a>

### `eslint/nitpicker/cognitive-complexity`

Limit how hard a function is to read: branches, loops and boolean chains cost more the deeper they nest.

- **Printed as:** `eslint-lint/nitpicker/cognitive-complexity`
- **Exception:** If this is intended, add `{"rule":"nitpicker/cognitive-complexity","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - This function has a cognitive complexity of {{value}}; the limit is {{max}}. Move nested branches and conditions into smaller named functions.

<a id="eslint-nitpicker-container-pause-requires-finally-unpause"></a>

### `eslint/nitpicker/container-pause-requires-finally-unpause`

Pause a container inside a try block with a finally unpause, or use withPausedContainer.

- **Printed as:** `eslint-lint/nitpicker/container-pause-requires-finally-unpause`
- **Exception:** If this is intended, add `{"rule":"nitpicker/container-pause-requires-finally-unpause","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Pause a container inside a try block with a finally unpause, or use withPausedContainer.

<a id="eslint-nitpicker-exhaustive-union-predicate"></a>

### `eslint/nitpicker/exhaustive-union-predicate`

Disallow classifying a union by listing only some of its members.

- **Printed as:** `eslint-lint/nitpicker/exhaustive-union-predicate`
- **Exception:** If this is intended, add `{"rule":"nitpicker/exhaustive-union-predicate","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - These comparisons list only some members of {{ union }}, so a member added later is silently classified as the default. Classify every member with a `switch` that has no `default`, or a `Record<Union, boolean>` lookup, so adding a member fails to compile.

<a id="eslint-nitpicker-fake-timers-require-restore"></a>

### `eslint/nitpicker/fake-timers-require-restore`

Require fake timers, and stubs made in test files, to be restored.

- **Printed as:** `eslint-lint/nitpicker/fake-timers-require-restore`
- **Exception:** If this is intended, add `{"rule":"nitpicker/fake-timers-require-restore","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Fake timers stay on for the tests that follow. Restore them: `afterEach(() => { vi.useRealTimers(); });`.
  - Fake timers stay on for the tests that follow. Restore them: `afterEach(() => { vi.useRealTimers(); });`. With user-event, create the user with `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` or its clicks wait forever.
  - This stubbed global stays stubbed for the tests that follow. Restore it: `afterEach(() => { vi.unstubAllGlobals(); });`, or stub it once in a setup file.
  - This stubbed environment variable stays set for the tests that follow. Restore it: `afterEach(() => { vi.unstubAllEnvs(); });`.

<a id="eslint-nitpicker-file-name-casing"></a>

### `eslint/nitpicker/file-name-casing`

Name files in the one casing the project's files already use.

- **Printed as:** `eslint-lint/nitpicker/file-name-casing`
- **Exception:** If this is intended, add `{"rule":"nitpicker/file-name-casing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - File name "{{name}}" is not {{casing}}, which this project uses for file names. Rename it, pin a different casing with "conventions": { "typescript.fileNames": "camelCase" } in nitpicker.config.json. An exception fits only when the name is deliberate.
  - File name "{{name}}" is not {{casing}}, which most other files in this folder use. Rename it. An exception fits only when the name is deliberate.

<a id="eslint-nitpicker-hermetic-git-in-tests"></a>

### `eslint/nitpicker/hermetic-git-in-tests`

Run git in tests with a hermetic environment: pass an `env` object, written in this file, that sets GIT_CONFIG_GLOBAL (for example to '/dev/null') and GIT_CONFIG_NOSYSTEM=1, so the developer's global git config (commit signing, hooks) does not apply.

- **Printed as:** `eslint-lint/nitpicker/hermetic-git-in-tests`
- **Exception:** If this is intended, add `{"rule":"nitpicker/hermetic-git-in-tests","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Run git in tests with a hermetic environment: pass an `env` object, written in this file, that sets GIT_CONFIG_GLOBAL (for example to '/dev/null') and GIT_CONFIG_NOSYSTEM=1, so the developer's global git config (commit signing, hooks) does not apply.

<a id="eslint-nitpicker-hover-test-needs-keyboard"></a>

### `eslint/nitpicker/hover-test-needs-keyboard`

Require a keyboard test in every component test file that hovers.

- **Printed as:** `eslint-lint/nitpicker/hover-test-needs-keyboard`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Exception:** If this is intended, add `{"rule":"nitpicker/hover-test-needs-keyboard","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Every hover behavior needs a keyboard equivalent. Add a test that tabs to the element (`await user.tab()`) and asserts the same state.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#react)

<a id="eslint-nitpicker-integration-test-uses-approved-harness"></a>

### `eslint/nitpicker/integration-test-uses-approved-harness`

Require integration tests to execute an approved production harness.

- **Printed as:** `eslint-lint/nitpicker/integration-test-uses-approved-harness`
- **Exception:** If this is intended, add `{"rule":"nitpicker/integration-test-uses-approved-harness","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Exercise the application through an approved integration-test harness.

<a id="eslint-nitpicker-naming-convention"></a>

### `eslint/nitpicker/naming-convention`

Enforce naming conventions for everything across a codebase.

- **Printed as:** `eslint-lint/nitpicker/naming-convention`
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/naming-convention).
- **Exception:** If this is intended, add `{"rule":"nitpicker/naming-convention","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - {{type}} name `{{name}}` must match one of the following formats: {{formats}}
  - {{type}} name `{{name}}` trimmed as `{{processedName}}` must match one of the following formats: {{formats}}
  - {{type}} name `{{name}}` must have one of the following {{position}}es: {{affixes}}
  - {{type}} name `{{name}}` must have {{count}} {{position}} underscore(s).
  - {{type}} name `{{name}}` must {{regexMatch}} the RegExp: {{regex}}
  - {{type}} name `{{name}}` must not have a {{position}} underscore.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/naming-convention)

<a id="eslint-nitpicker-no-assertion-in-loop"></a>

### `eslint/nitpicker/no-assertion-in-loop`

Ban assertions inside loops and iterating callbacks in a test.

- **Printed as:** `eslint-lint/nitpicker/no-assertion-in-loop`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-assertion-in-loop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - This assertion sits in a `{{construct}}` whose body can run zero times (an empty collection, or a condition that is false at the start), so the test can pass without asserting anything. Assert the whole collection at once (`expect(orders).toEqual([...])`, `assert.deepStrictEqual(orders, [...])`), put a table of cases in a parameterized test (`it.each`/`test.each`, or node:test subtests registered from a literal table), or use the loop only to build data before an unconditional assertion. An exception fits only when the loop cannot be replaced by one of these, for example cases generated at run time.
  - This assertion runs once per row of a literal table in a `{{construct}}`: in Vitest, Jest and Mocha write the table as `it.each([...])('name', (row) => { ... })` (or `test.each`), so each row is its own test and a table that comes up empty cannot pass unnoticed; in node:test register one subtest per row (`for (const row of [...]) { await t.test(row.name, () => { ... }); }`). To check one collection instead, assert it whole (`expect(rows).toEqual([...])`). An exception fits only when the loop cannot be replaced by one of these, for example cases generated at run time.
  - These node:test subtests are registered in a `{{construct}}` over a collection that can be empty, so no case may run and the test can pass without asserting anything. Register them from a literal, non-empty table (`for (const row of [...]) { await t.test(row.name, () => { ... }); }`, or a same-file const holding that array), or assert the whole collection at once. An exception fits only when the loop cannot be replaced by one of these, for example cases generated at run time.

<a id="eslint-nitpicker-no-branch-in-composition-root"></a>

### `eslint/nitpicker/no-branch-in-composition-root`

Keep branches out of composition roots, which only wire features together.

- **Printed as:** `eslint-lint/nitpicker/no-branch-in-composition-root`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-branch-in-composition-root","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - The composition root only wires features: it passes things in and does not branch, loop or default a missing value (`??`, `||`). Move this lookup or decision into the feature's adapters/ or domain/. A guard that only throws may stay: `const container = document.getElementById('root'); if (container === null) { throw new Error('#root is missing'); }` and then `createRoot(container)`. An exception fits only when this branch belongs here.

<a id="eslint-nitpicker-no-comments"></a>

### `eslint/nitpicker/no-comments`

Allow only non-suppression tool directives as comments, plus doc comments on exported API.

- **Printed as:** `eslint-lint/nitpicker/no-comments`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-comments","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Fix the type error or narrow the value; TypeScript suppression comments ({{directive}}) are not allowed. To test that a type rejects a value, assert `expectTypeOf(fn).parameter(0).not.toExtend<Value>()`.
  - Fix the violation; inline ESLint disables are not allowed.
  - Test this code instead; coverage and mutation ignore comments ({{directive}}) hide untested code. An exception fits only when it truly cannot be tested.
  - Remove the comment and put the intent in code: a descriptive identifier, a named function, or a type. Only non-suppression tool directives may be comments.
  - JSDoc holds types only: remove the description text and put the intent in a descriptive identifier or a named function.
  - The JSDoc tag @{{tag}} is not allowed: JSDoc holds types only (@param, @returns, @type, @typedef, @template, @import).
  - Write the JSDoc tag as `{{usage}}`.
  - Do not use `any`, `*` or a bare `?` in a JSDoc type. Use `unknown` and parse it into a specific type at the boundary with zod, or write the specific type.
  - Use `undefined` for an absent value; `null` and the `?T` and `T?` forms are not allowed in a JSDoc type. Type it as optional with `undefined`.
  - Do not assert with a JSDoc cast (`/** @type {T} */ (value)`). Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `/** @type {const} */` is allowed.
  - This doc comment only restates {{name}}. Delete it, or say what the name cannot: a unit, a limit, an edge case or why.
  - This doc comment's description is {{lines}} lines (limit {{limit}}). Keep the non-obvious point, a unit, a limit or an edge case, and put the rest in names and types.
  - Doc comments are allowed only on exported declarations and the members of exported types. Remove this one and put the intent in code: a descriptive identifier, a named function, or a type.

<a id="eslint-nitpicker-no-compatibility-shim"></a>

### `eslint/nitpicker/no-compatibility-shim`

Disallow deprecated declarations and second names for an exported API.

- **Printed as:** `eslint-lint/nitpicker/no-compatibility-shim`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-compatibility-shim","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - A `@deprecated` declaration keeps the old API next to its replacement. Delete it and update its callers to the replacement in the same change.
  - `{{ alias }}` is a second exported name for `{{ target }}`. Delete `{{ alias }}` and update its callers to import `{{ target }}`.

<a id="eslint-nitpicker-no-copy-pasted-tests"></a>

### `eslint/nitpicker/no-copy-pasted-tests`

Require one it.each table instead of copies of a test.

- **Printed as:** `eslint-lint/nitpicker/no-copy-pasted-tests`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-copy-pasted-tests","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - This test repeats the body of {{count}} others and differs only in its literals. Write one `it.each` table with a row per case.

<a id="eslint-nitpicker-no-default-export"></a>

### `eslint/nitpicker/no-default-export`

Disallow default exports outside config files.

- **Printed as:** `eslint-lint/nitpicker/no-default-export`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-default-export","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Use a named export (`export function name() {}` or `export const name = ...`). Default exports are only allowed in config files, `declare module` blocks and the framework files that need one (Next.js routes, Storybook stories, Expo Router screens). An exception fits only when a framework or library requires it.
  - Use a named export (`export { name }`). Default exports are only allowed in config files and in the framework files that need one (Next.js routes, Storybook stories, Expo Router screens). An exception fits only when a framework or library requires it.

<a id="eslint-nitpicker-no-dev-dependency-in-production"></a>

### `eslint/nitpicker/no-dev-dependency-in-production`

Production code imports only packages listed in dependencies.

- **Printed as:** `eslint-lint/nitpicker/no-dev-dependency-in-production`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-dev-dependency-in-production","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - {{name}} is only a devDependency, but production code imports it. Move it to "dependencies" in package.json. {{hint}}
  - {{manifest}} is not a JSON object, so imports cannot be checked against its dependencies. Fix the file.

<a id="eslint-nitpicker-no-disabled-tls-verification"></a>

### `eslint/nitpicker/no-disabled-tls-verification`

Disallow turning off TLS certificate verification.

- **Printed as:** `eslint-lint/nitpicker/no-disabled-tls-verification`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-disabled-tls-verification","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Turning off TLS certificate verification lets anyone on the network pose as the server, and turning it off by environment ships the switch to production. Keep verification on in every environment and trust the certificate authority instead: `new https.Agent({ ca: readFileSync(caPath) })`, `tlsCAFile` for MongoDB, or set NODE_EXTRA_CA_CERTS for a private CA; for browser automation against a local certificate pin it with `--ignore-certificate-errors-spki-list=<hash>`. A server that asks for optional client certificates sets `requestCert: true` and checks `socket.authorized`. An exception fits only when a contained case cannot do that.

<a id="eslint-nitpicker-no-external-executables-in-unit-tests"></a>

### `eslint/nitpicker/no-external-executables-in-unit-tests`

Tests requiring external executables belong in the integration project.

- **Printed as:** `eslint-lint/nitpicker/no-external-executables-in-unit-tests` and `coding-standards/nitpicker/no-external-executables-in-unit-tests`
- **Presets:** TypeScript
- **Analyzers:** `eslint-lint` and `coding-standards`
- **Scope:** The TypeScript preset only.
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-external-executables-in-unit-tests","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Tests requiring external executables belong in the integration project.

<a id="eslint-nitpicker-no-falsy-default"></a>

### `eslint/nitpicker/no-falsy-default`

Disallow replacing a falsy parameter with a default through || or a ternary.

- **Printed as:** `eslint-lint/nitpicker/no-falsy-default`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-falsy-default","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `{{ name }}` is replaced by the default whenever it is falsy, so `0`, `''` and `false` count as not given. Default only `undefined` with `??` (`limit ?? DEFAULT_LIMIT`), or test `limit === undefined`.

<a id="eslint-nitpicker-no-first-test-charged-setup"></a>

### `eslint/nitpicker/no-first-test-charged-setup`

"{{name}}" is memoized lazily at module level and filled by a call, so whichever test runs first pays for its setup, reports show that test as slow, and test order starts to matter. Compute it once in beforeAll and let tests read it. An exception fits only when the setup is cheap or the lazy memo is intended.

- **Printed as:** `eslint-lint/nitpicker/no-first-test-charged-setup`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-first-test-charged-setup","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - "{{name}}" is memoized lazily at module level and filled by a call, so whichever test runs first pays for its setup, reports show that test as slow, and test order starts to matter. Compute it once in beforeAll and let tests read it. An exception fits only when the setup is cheap or the lazy memo is intended.

<a id="eslint-nitpicker-no-fixed-sleep-synchronization"></a>

### `eslint/nitpicker/no-fixed-sleep-synchronization`

Fixed sleeps are non-deterministic; wait on a condition with vi.waitFor or expect.poll. An exception fits only when a real wait is unavoidable.

- **Printed as:** `eslint-lint/nitpicker/no-fixed-sleep-synchronization`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-fixed-sleep-synchronization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Fixed sleeps are non-deterministic; wait on a condition with vi.waitFor or expect.poll. An exception fits only when a real wait is unavoidable.
  - Do not assert absence by letting a wait time out: `.rejects` passes only after the full timeout, so the test is slow and depends on the delay. Advance fake timers past the delay (`vi.advanceTimersByTime`) and assert absence at once, such as `expect(screen.queryByRole('tooltip')).toBeNull()`. An exception fits only when a real wait is unavoidable.
  - `waitForTimeout` sleeps on wall-clock time. Wait on a condition instead, such as `await expect(locator).toBeVisible()`. An exception fits only when a real wait is unavoidable.
  - `cy.wait(<number>)` sleeps on wall-clock time. Wait on a request alias (`cy.wait('@request')`) or retry an assertion (`cy.get(selector).should('be.visible')`). An exception fits only when a real wait is unavoidable.

<a id="eslint-nitpicker-no-forwarding-wrapper"></a>

### `eslint/nitpicker/no-forwarding-wrapper`

Disallow a function that only forwards its parameters to another function.

- **Printed as:** `eslint-lint/nitpicker/no-forwarding-wrapper`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-forwarding-wrapper","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `{{ name }}` only forwards its parameters to `{{ target }}` and has the same parameter and return types. Delete it and export `{{ target }}` in its place with `export { {{ target }} as {{ exported }} }`, or call `{{ target }}` directly.
  - `{{ name }}` only forwards its parameters to `{{ target }}` and has the same parameter and return types. Call `{{ target }}` directly where `{{ name }}` is used and delete the wrapper.

<a id="eslint-nitpicker-no-git-repository-per-test"></a>

### `eslint/nitpicker/no-git-repository-per-test`

Do not create a git repository in each test or beforeEach. Build a template repository once in beforeAll and copy it per test with cpSync.

- **Printed as:** `eslint-lint/nitpicker/no-git-repository-per-test`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-git-repository-per-test","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Do not create a git repository in each test or beforeEach. Build a template repository once in beforeAll and copy it per test with cpSync.

<a id="eslint-nitpicker-no-handwritten-boundary-guard"></a>

### `eslint/nitpicker/no-handwritten-boundary-guard`

Require external data in adapters to be parsed with a schema instead of a hand-written type guard.

- **Printed as:** `eslint-lint/nitpicker/no-handwritten-boundary-guard`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-handwritten-boundary-guard","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Do not hand-write a type guard for unknown input: parse it once at the boundary with {{phrase}} ({{example}}). A predicate over a union (`(result): result is Ok => result.kind === "ok"`) is fine. An exception fits only when the guard is genuinely needed.
  - Do not hand-narrow an `unknown` value with `typeof x === "object"` or `"key" in x`: parse it once at the boundary with {{phrase}} ({{example}}). A caught error is read with `error instanceof Error`. An exception fits only when the narrowing is genuinely needed.
  - This overload implementation returns unknown or any, which makes its overload signatures a cast. Return a typed value, or split it into separate functions. An exception fits only when it is deliberate.
  - Pass `JSON.parse(text)` straight into `{{call}}(...)` inside the same `try`. An exception fits only when the text is trusted and already typed.
  - Copy a value with `structuredClone(value)`, not `JSON.parse(JSON.stringify(value))`. An exception fits only when it is deliberate.

<a id="eslint-nitpicker-no-internal-module-mocks"></a>

### `eslint/nitpicker/no-internal-module-mocks`

Inject the dependency instead of replacing internal production module {{source}}. An exception fits only when injection is not possible.

- **Printed as:** `eslint-lint/nitpicker/no-internal-module-mocks` and `coding-standards/nitpicker/no-internal-module-mocks`
- **Analyzers:** `eslint-lint` and `coding-standards`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-internal-module-mocks","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Inject the dependency instead of replacing internal production module {{source}}. An exception fits only when injection is not possible.
  - Inject the dependency instead of replacing a function of internal production module {{source}} with `vi.spyOn`. An exception fits only when injection is not possible.

<a id="eslint-nitpicker-no-interval-polling-in-tests"></a>

### `eslint/nitpicker/no-interval-polling-in-tests`

Prefer vi.waitFor / expect.poll over setInterval polling in tests.

- **Printed as:** `eslint-lint/nitpicker/no-interval-polling-in-tests`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-interval-polling-in-tests","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Prefer vi.waitFor / expect.poll over setInterval polling in tests.

<a id="eslint-nitpicker-no-magic-numbers"></a>

### `eslint/nitpicker/no-magic-numbers`

Disallow magic numbers.

- **Printed as:** `eslint-lint/nitpicker/no-magic-numbers`
- **Allowed form:** See the tool's documentation: [Rule documentation](https://typescript-eslint.io/rules/no-magic-numbers).
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-magic-numbers","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Number constants declarations must use 'const'.
  - No magic number: {{raw}}. Name it with a module-level constant: `const SECONDS_PER_DAY = 24 * 60 * 60;` (-1, 0, 1, 2, 10, 100 and 1000, an HTTP status code such as `res.status(404)` and the digits of `toFixed(2)` are allowed). An exception fits only when the number is clear where it is.
- **See also:** [Rule documentation](https://typescript-eslint.io/rules/no-magic-numbers)

<a id="eslint-nitpicker-no-managed-resource-construction-outside-composition-roots"></a>

### `eslint/nitpicker/no-managed-resource-construction-outside-composition-roots`

Keep managed resource construction in approved composition roots.

- **Printed as:** `eslint-lint/nitpicker/no-managed-resource-construction-outside-composition-roots`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-managed-resource-construction-outside-composition-roots","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Construct {{name}} only in the composition root (src/main/composition-root.ts, main.ts or server.ts) and pass it in as a parameter. An exception fits only when it is a plain value, not a long-lived resource.

<a id="eslint-nitpicker-no-mocking-subject-under-test"></a>

### `eslint/nitpicker/no-mocking-subject-under-test`

Prevent a test from mocking the production module it imports as its subject.

- **Printed as:** `eslint-lint/nitpicker/no-mocking-subject-under-test`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-mocking-subject-under-test","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Do not mock the production subject {{source}}.

<a id="eslint-nitpicker-no-module-level-let"></a>

### `eslint/nitpicker/no-module-level-let`

Ban module-level let, which is hidden mutable module state.

- **Printed as:** `eslint-lint/nitpicker/no-module-level-let`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-module-level-let","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Use 'const' instead of module-level 'let'. Keep state in a parameter or in an object constructed in the composition root and passed in.

<a id="eslint-nitpicker-no-module-level-mutable-state"></a>

### `eslint/nitpicker/no-module-level-mutable-state`

Disallow module-level collections and objects that the module mutates.

- **Printed as:** `eslint-lint/nitpicker/no-module-level-mutable-state`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-module-level-mutable-state","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Module-level '{{name}}' is mutated, which is hidden shared state. Build a lookup table inside a function and return it, create shared state in the composition root and pass it in, or return a new value instead of mutating. An exception fits only when it is a deliberate per-process singleton.
  - Module-level '{{name}}' is an exported mutable collection that any importer can change. If importers only read it, annotate it with a readonly type (`ReadonlySet<T>`, `ReadonlyMap<K, V>`, `readonly number[]`); otherwise build it inside a function and return it, or create it in the composition root and pass it in. An exception fits only when it is a deliberate per-process singleton.

<a id="eslint-nitpicker-no-mutating-method-in-domain"></a>

### `eslint/nitpicker/no-mutating-method-in-domain`

Disallow mutating methods of arrays, Set, Map, Date, typed arrays, Buffer and URLSearchParams in domain code.

- **Printed as:** `eslint-lint/nitpicker/no-mutating-method-in-domain`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-mutating-method-in-domain","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - domain/ code does not mutate values, and {{owner}}.{{method}} changes the value it is called on: build a new value instead, e.g. new Set([...set, x]), new Map([...map, [key, value]]), new Map(xs.map((x) => [x.id, x] as const)) or new Date(ms + delta).

<a id="eslint-nitpicker-no-node-process-per-test"></a>

### `eslint/nitpicker/no-node-process-per-test`

Do not start a Node process (process.execPath, node, npx or a node_modules/.bin script) from a test or beforeEach. Import the function and call it in-process; start the application as a process only through the AppProcess harness in the test fixtures. An exception fits only when this test checks the process boundary itself (exit codes, signals, stdout).

- **Printed as:** `eslint-lint/nitpicker/no-node-process-per-test`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-node-process-per-test","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Do not start a Node process (process.execPath, node, npx or a node_modules/.bin script) from a test or beforeEach. Import the function and call it in-process; start the application as a process only through the AppProcess harness in the test fixtures. An exception fits only when this test checks the process boundary itself (exit codes, signals, stdout).

<a id="eslint-nitpicker-no-null"></a>

### `eslint/nitpicker/no-null`

Disallow null outside the allowed library forms.

- **Printed as:** `eslint-lint/nitpicker/no-null`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-null","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Use `undefined` for an absent value, and an optional field or parameter (`value?: T`) where it may be missing. `null` is only for strict comparison with a library value and the `JSON.stringify` replacer argument. An exception fits only when a framework or library requires it.
  - Use `undefined` for an absent value, and an optional field or parameter (`value?: T`) where it may be missing. `null` is only for strict comparison with a library value and the `JSON.stringify` replacer argument. An exception fits only when a framework or library requires it. Type it as optional with `undefined`.

<a id="eslint-nitpicker-no-parameter-mutation"></a>

### `eslint/nitpicker/no-parameter-mutation`

Disallow changing an array, Set, Map or indexed object that a parameter holds in place.

- **Printed as:** `eslint-lint/nitpicker/no-parameter-mutation`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-parameter-mutation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `{{ name }}` changes the value the caller passed in. Build and return a new value instead (`[...items, item]`, `new Set([...set, item])`, `{ ...table, [key]: value }`, `items.toSorted()`), or copy the parameter first (`const copy = [...items]`).

<a id="eslint-nitpicker-no-partial-output-assertion"></a>

### `eslint/nitpicker/no-partial-output-assertion`

Require tests to assert the whole output instead of a fragment of it.

- **Printed as:** `eslint-lint/nitpicker/no-partial-output-assertion`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-partial-output-assertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Assert the whole output with `toEqual` or `toBe` instead of checking that it contains a fragment (`toContain`, or `toMatch` with a pattern that is not anchored `^...$`): a fragment passes even when the rest is wrong. An exception fits only when the output is too large or unordered to pin.
  - Pass the whole expected value to `toEqual` instead of a partial match (`toMatchObject`, `expect.objectContaining`, `expect.stringContaining`, `expect.arrayContaining`): the rest of the value goes unchecked. Use `expect.any(Type)` for a field that varies. An exception fits only when the value is too large or unordered to pin.

<a id="eslint-nitpicker-no-process-access-outside-composition-root"></a>

### `eslint/nitpicker/no-process-access-outside-composition-root`

Read environment variables and exit the process only in the composition root.

- **Printed as:** `eslint-lint/nitpicker/no-process-access-outside-composition-root`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-process-access-outside-composition-root","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Read environment variables only in the composition root: parse the environment once with a zod schema there and pass the typed config down as a parameter. An exception fits only when this module is a config loader or a script.
  - process.exit stops the whole process from inside library code. Return a result or throw an Error subclass, and call process.exit only in the composition root or a main guard (`if (import.meta.main)`). An exception fits only when this module is an entry script.

<a id="eslint-nitpicker-no-process-globals-outside-main-guard"></a>

### `eslint/nitpicker/no-process-globals-outside-main-guard`

A test helper or fixture script may use process.{{member}} only inside a main guard such as `if (import.meta.main)`. Export a function that takes the arguments and returns the exit code, and call it from the main guard, so tests can import it instead of spawning it.

- **Printed as:** `eslint-lint/nitpicker/no-process-globals-outside-main-guard`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-process-globals-outside-main-guard","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - A test helper or fixture script may use process.{{member}} only inside a main guard such as `if (import.meta.main)`. Export a function that takes the arguments and returns the exit code, and call it from the main guard, so tests can import it instead of spawning it.

<a id="eslint-nitpicker-no-production-console"></a>

### `eslint/nitpicker/no-production-console`

Keep production logging on the application logger path.

- **Printed as:** `eslint-logging/nitpicker/no-production-console`
- **Analyzers:** `eslint-logging`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-production-console","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Use the application logger instead of console.{{method}}(). An exception fits only when this module prints the program output.
  - Use the application logger instead of process.{{stream}}.write(). Program output is written in the composition root. An exception fits only when this module prints the program output.

<a id="eslint-nitpicker-no-production-imports-in-setup-files"></a>

### `eslint/nitpicker/no-production-imports-in-setup-files`

Keep production code out of test setup files.

- **Printed as:** `eslint-lint/nitpicker/no-production-imports-in-setup-files`
- **Presets:** TypeScript
- **Scope:** The TypeScript preset only.
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-production-imports-in-setup-files","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - A setup file runs before every test file, so production code imported here is covered without a test. Import {{source}} in the tests that need it.

<a id="eslint-nitpicker-no-promise-chain"></a>

### `eslint/nitpicker/no-promise-chain`

Disallow then, catch and finally promise chains.

- **Printed as:** `eslint-lint/nitpicker/no-promise-chain`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-promise-chain","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Use async/await (with try/catch) instead of promise chains, and Promise.all with a limiter for concurrent work. An exception fits only when a framework or library requires it.

<a id="eslint-nitpicker-no-raised-test-timeout"></a>

### `eslint/nitpicker/no-raised-test-timeout`

Keep the {{kind}} timeout between 1 and {{ceiling}} ms for this test project. Make the test faster or configure its named project timeout in tools.tests.timeouts.

- **Printed as:** `eslint-lint/nitpicker/no-raised-test-timeout`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-raised-test-timeout","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Keep the {{kind}} timeout between 1 and {{ceiling}} ms for this test project. Make the test faster or configure its named project timeout in tools.tests.timeouts.
  - Give the {{kind}} timeout as a number between 1 and {{ceiling}} ms written in this file, or keep the default.

<a id="eslint-nitpicker-no-real-time-random-or-network"></a>

### `eslint/nitpicker/no-real-time-random-or-network`

Keep the real clock, randomness and network out of tests.

- **Printed as:** `eslint-lint/nitpicker/no-real-time-random-or-network`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-real-time-random-or-network","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - The real clock makes the test depend on when it runs. Pass the time in, or fake it with `vi.useFakeTimers()` and `vi.setSystemTime(...)`.
  - Real randomness makes the test fail on some runs. Pass a seeded or fixed value in, or fix it with `vi.spyOn(Math, "random")`.
  - A unit test must not reach the network. Inject the client and fake it.

<a id="eslint-nitpicker-no-runtime-exclusive-props-check"></a>

### `eslint/nitpicker/no-runtime-exclusive-props-check`

Disallow a runtime check that rejects a combination of props.

- **Printed as:** `eslint-lint/nitpicker/no-runtime-exclusive-props-check`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-runtime-exclusive-props-check","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Props {{ props }} are checked together at runtime. Make the props a discriminated union (`{ icon: Icon; image?: never } | { image: string; icon?: never }`) so the compiler rejects the combination.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#react)

<a id="eslint-nitpicker-no-self-recursion"></a>

### `eslint/nitpicker/no-self-recursion`

Disallow a function that calls itself, directly or through another function.

- **Printed as:** `eslint-lint/nitpicker/no-self-recursion`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-self-recursion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - '{{name}}' calls itself. Retry or poll: loop with for...of over attempt numbers. Tree walk (directories, AST, JSON): for...of over a worklist, pushing each node's children onto it (for (const node of pending) { pending.push(...children) }). Flat data: map, filter, flatMap or Object.fromEntries. A component that renders itself in JSX is not reported. An exception fits only when the recursion is bounded and deliberate.
  - '{{name}}' calls itself. domain/ has no loops and no recursion, so a walk over data of unknown depth (a tree) belongs in adapters/: for...of over a worklist, pushing each node's children onto it. Pass domain/ the flat result; flat data uses map, filter, flatMap or Object.fromEntries. An exception fits only when the recursion is bounded and deliberate.
  - '{{name}}' and '{{other}}' call each other. Replace the cycle with a for...of loop over a worklist, or merge them into one function that loops. An exception fits only when the recursion is bounded and deliberate.

<a id="eslint-nitpicker-no-server-or-worker-per-test"></a>

### `eslint/nitpicker/no-server-or-worker-per-test`

Do not start a server or worker thread in each test or beforeEach. Start it once in beforeAll and reset its state between tests, or test the logic against an in-memory implementation and keep the real transport for transport tests. An exception fits only when each test needs a fresh server.

- **Printed as:** `eslint-lint/nitpicker/no-server-or-worker-per-test`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-server-or-worker-per-test","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Do not start a server or worker thread in each test or beforeEach. Start it once in beforeAll and reset its state between tests, or test the logic against an in-memory implementation and keep the real transport for transport tests. An exception fits only when each test needs a fresh server.

<a id="eslint-nitpicker-no-shared-test-state"></a>

### `eslint/nitpicker/no-shared-test-state`

Ban initialised let state shared by the tests of a file.

- **Printed as:** `eslint-lint/nitpicker/no-shared-test-state`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-shared-test-state","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Shared mutable state makes tests depend on their order. Keep `{{name}}` inside the test, or declare it without a value and set it in `beforeEach`.

<a id="eslint-nitpicker-no-shell-string-command"></a>

### `eslint/nitpicker/no-shell-string-command`

Disallow running a shell command built from a string.

- **Printed as:** `eslint-lint/nitpicker/no-shell-string-command`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-shell-string-command","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - A shell command built from a variable or template is a command injection risk. Run the program with `execFile(program, [args])` or `spawn(program, [args])`, one argument per array entry. If the command is fixed and trusted, write it as a plain string literal.
  - `{{program}} {{flag}}` runs a command built from a variable or template through a shell, a command injection risk like `exec`. Run the program itself with `execFile(program, [args])`, one argument per array entry. If the command is fixed and trusted, write it as a plain string literal.

<a id="eslint-nitpicker-no-silent-catch"></a>

### `eslint/nitpicker/no-silent-catch`

Require a catch clause to use the caught value or return a failure result, not discard it.

- **Printed as:** `eslint-errors/nitpicker/no-silent-catch`
- **Analyzers:** `eslint-errors`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-silent-catch","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - This catch discards the failure. Return a failure result (`return { kind: 'malformed-json' }`), or rethrow an Error subclass with `{ cause: error }`. An exception fits only when dropping it is intended.

<a id="eslint-nitpicker-no-singular-and-plural-prop"></a>

### `eslint/nitpicker/no-singular-and-plural-prop`

Disallow optional alternative props that take one item or a list of the same item.

- **Printed as:** `eslint-lint/nitpicker/no-singular-and-plural-prop`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-singular-and-plural-prop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Optional props `{{ singular }}` and `{{ plural }}` are two ways to pass the same data. Keep `{{ plural }}` and pass a single item as a one-element array.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#react)

<a id="eslint-nitpicker-no-sql-string-building"></a>

### `eslint/nitpicker/no-sql-string-building`

Disallow SQL text built from runtime values.

- **Printed as:** `eslint-lint/nitpicker/no-sql-string-building`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-sql-string-building","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - SQL text built by {{kind}} lets a runtime value change the statement (SQL injection). Use {{tagged}}bind parameters: `pool.query("SELECT * FROM users WHERE id = $1", [id])` (pg), `?` with an array (mysql2, sqlite, knex.raw, knex.whereRaw), `:name` (sequelize, typeorm `.where("user.id = :id", { id })`). Placeholder lists are built from placeholders alone: `ids.map(() => "?").join(",")`, rows as `rows.map(() => "(?, ?)").join(", ")`, `$${i + 1}`, and optional filters as `conditions.push("name = ?")` joined with `" AND "`. A table or column name comes from a fixed lookup (`const COLUMNS = { name: "name" } as const; COLUMNS[key]`) or a value typed as a union of literal names (`table: "users" | "orders"`). An exception fits only when the value is trusted and cannot be written that way.

<a id="eslint-nitpicker-no-switched-off-tests"></a>

### `eslint/nitpicker/no-switched-off-tests`

Ban test forms that switch a test off.

- **Printed as:** `eslint-lint/nitpicker/no-switched-off-tests`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-switched-off-tests","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Do not leave a `todo` test: write the test, or delete the stub.
  - A literal condition switches the test off for good. Delete the test or make it run; a real platform condition such as `process.platform === "win32"` is allowed.

<a id="eslint-nitpicker-no-test-helpers-in-source"></a>

### `eslint/nitpicker/no-test-helpers-in-source`

Keep test helpers and fixtures out of production source roots.

- **Printed as:** `eslint-lint/nitpicker/no-test-helpers-in-source`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-test-helpers-in-source","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - This looks like a test helper ({{name}}), but it sits in production source, so it is mutation-tested and shipped. Tests in this project live under {{testRoot}}/, so move it to a test-support/ folder there ({{testRoot}}/test-support/). An exception fits only when it is real production code.
  - This looks like a test helper ({{name}}), but it sits in production source outside a test-support/ folder. Tests in this project sit next to the code, and test-only modules go in a test-support/ folder beside the code they serve: move it there. An exception fits only when it is real production code.

<a id="eslint-nitpicker-no-test-retry"></a>

### `eslint/nitpicker/no-test-retry`

Remove the retry: a test that passes on a later attempt hides a flaky or racy test. Fix the cause, such as waiting on the condition instead of a delay or isolating shared state.

- **Printed as:** `eslint-lint/nitpicker/no-test-retry`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-test-retry","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Remove the retry: a test that passes on a later attempt hides a flaky or racy test. Fix the cause, such as waiting on the condition instead of a delay or isolating shared state.

<a id="eslint-nitpicker-no-throw"></a>

### `eslint/nitpicker/no-throw`

Disallow throw so expected failures are returned as discriminated unions.

- **Printed as:** `eslint-lint/nitpicker/no-throw`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-throw","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Return a discriminated-union failure result (for example { kind: "failed", reason }) instead of throwing.

<a id="eslint-nitpicker-no-tri-state-boolean"></a>

### `eslint/nitpicker/no-tri-state-boolean`

Disallow a boolean that can also be undefined or null.

- **Printed as:** `eslint-lint/nitpicker/no-tri-state-boolean`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-tri-state-boolean","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - {{ name }} is a boolean that can also be absent, so it has three states: true, false and nothing. Take a required `boolean`, or name each state in a union of string literals (`'on' | 'off' | 'auto'`).

<a id="eslint-nitpicker-no-ui-framework-in-domain"></a>

### `eslint/nitpicker/no-ui-framework-in-domain`

Keep UI frameworks and UI state libraries out of domain/.

- **Printed as:** `eslint-lint/nitpicker/no-ui-framework-in-domain`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-ui-framework-in-domain","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - domain/ does not import a UI framework or UI state library (`{{source}}`): components, hooks and stores live in adapters/ (or shared/ui) and call the logic in domain/, which takes and returns plain values. An exception fits only when a framework requires this file in domain/.
  - domain/ does not render: JSX belongs to a component in adapters/ (or shared/ui), which calls the logic in domain/ and renders its plain result. An exception fits only when a framework requires this file in domain/.
  - domain/ does not import a UI framework or UI state library, here `{{framework}}` through `{{source}}`: components, hooks and stores live in adapters/ (or shared/ui) and call the logic in domain/, which takes and returns plain values. An exception fits only when a framework requires this file in domain/.

<a id="eslint-nitpicker-no-uncollected-tests"></a>

### `eslint/nitpicker/no-uncollected-tests`

Report test calls in a file the test runner never collects.

- **Printed as:** `eslint-lint/nitpicker/no-uncollected-tests`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-uncollected-tests","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - This file defines tests but is not named like a test file, so they never run. Rename it `*.test.ts` (or `*.spec.ts`). An exception fits only when another test file runs it on purpose.

<a id="eslint-nitpicker-no-uninjectable-delay"></a>

### `eslint/nitpicker/no-uninjectable-delay`

{{timer}} waits {{name}} ({{value}} ms), a module constant that exported "{{owner}}" cannot override, so a test must wait it out or fake timers. Accept the delay as an option with {{name}} as its default, for example "{ delayMs = {{name}} } = {}". An exception fits only when the delay is deliberately fixed.

- **Printed as:** `eslint-lint/nitpicker/no-uninjectable-delay`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-uninjectable-delay","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - {{timer}} waits {{name}} ({{value}} ms), a module constant that exported "{{owner}}" cannot override, so a test must wait it out or fake timers. Accept the delay as an option with {{name}} as its default, for example "{ delayMs = {{name}} } = {}". An exception fits only when the delay is deliberately fixed.

<a id="eslint-nitpicker-no-unknown-in-domain"></a>

### `eslint/nitpicker/no-unknown-in-domain`

Disallow the unknown type in parameter and property types of domain code.

- **Printed as:** `eslint-lint/nitpicker/no-unknown-in-domain`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-unknown-in-domain","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - domain/ code takes typed values, not unknown (also through a type alias). Write a readonly type for this value in domain/; adapters/ parses the input with {{phrase}} and passes the result in (the parsed value is assignable to a readonly type; do not import the schema type from adapters/). A caught error may be typed unknown as `cause` or `error`. An exception fits only when the value is genuinely opaque.

<a id="eslint-nitpicker-no-unknown-main-folder"></a>

### `eslint/nitpicker/no-unknown-main-folder`

Allow only features, shared and the composition root under src/main.

- **Printed as:** `eslint-lint/nitpicker/no-unknown-main-folder`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-unknown-main-folder","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - '{{folder}}' sits directly in src/main/, which holds only features/, shared/ and the composition root (composition-root.ts, main.ts, server.ts) and index.ts. Move it into the feature that uses it, or into shared/ when several features need it. An exception fits only when the file is deliberate.
  - '{{folder}}/' is not a layer of this layout. Under src/main/ put code in features/\<name>/ (domain/ for pure logic, adapters/ for I/O), in shared/ when several features need it, or in the composition root. An exception fits only when this folder is deliberate.
  - '{{folder}}/' is not a layer of a feature. A feature holds domain/ for pure logic and adapters/ for I/O (and ui/ for components in a React project), and its public index.ts. An exception fits only when this folder is deliberate.
  - '{{folder}}' sits directly in a feature folder, which holds only its public index.ts besides domain/ and adapters/ (and ui/ for components in a React project). Move it into domain/ if it is pure logic or adapters/ if it does I/O. An exception fits only when the file is deliberate.

<a id="eslint-nitpicker-no-unowned-async-assertion"></a>

### `eslint/nitpicker/no-unowned-async-assertion`

Require tests to wait for the callbacks that hold their assertions.

- **Printed as:** `eslint-lint/nitpicker/no-unowned-async-assertion`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-unowned-async-assertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - This assertion runs in a `{{host}}` callback the test does not wait for: the test function returns first, so a failure is lost or blamed on another test. Await a promise the callback resolves, or fake the timers and advance them past it in the test. An exception fits only when the test waits for the callback in a way nitpicker cannot see.
  - This assertion runs in a `{{host}}` callback the test does not wait for: the test function returns first, so a failure is lost or blamed on another test. Await a promise the callback resolves, or `await` after scheduling it so it runs before the test ends. An exception fits only when the test waits for the callback in a way nitpicker cannot see.
  - This assertion runs in a `{{host}}` handler, and nothing after it in the test triggers the event or waits for it, so the event can arrive after the test has finished and a failure is lost or blamed on another test. Trigger the event in the test after adding the handler, or await it (`await once(emitter, 'ready')`, or a promise the handler resolves). An exception fits only when the test waits for the callback in a way nitpicker cannot see.
  - This assertion runs in the callback of `{{host}}`, which Node calls after the test function returns, so a failure is lost or blamed on another test. Await the promise form of the API (`node:fs/promises`, `util.promisify`) instead. An exception fits only when the test waits for the callback in a way nitpicker cannot see.

<a id="eslint-nitpicker-no-unsafe-deserialization"></a>

### `eslint/nitpicker/no-unsafe-deserialization`

Disallow rebuilding code or objects from untrusted data.

- **Printed as:** `eslint-lint/nitpicker/no-unsafe-deserialization`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-unsafe-deserialization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `{{name}}` rebuilds functions from the data it reads, so a crafted payload runs code. Read the data as JSON, `JSON.parse(text)`, and check it against a schema (zod, valibot) into a typed value. An exception fits only when this process alone writes and reads the data.
  - `v8.deserialize(v8.serialize(value))` copies a value through the structured-clone bytes. Copy it with `structuredClone(value)`, which keeps `Map`, `Set`, `Date` and cycles and parses no bytes. An exception fits only when you need the v8 wire format here.
  - `yaml.{{name}}` in js-yaml 3 loads with `DEFAULT_FULL_SCHEMA`, so `!!js/function` tags build functions from the text. Use `yaml.safeLoad(text)` (or pass `{ schema: yaml.JSON_SCHEMA }`), or upgrade to js-yaml 4 where `load` is safe, and check the result against a schema. An exception fits only when you need custom tags.
  - `v8.{{name}}` trusts its bytes as a structured clone of the writer. Read untrusted input as JSON, `JSON.parse(text)`, and check it against a schema (zod, valibot). An exception fits only when this process alone writes and reads the bytes.
  - `{{name}}` runs text as code, and a vm context is not a security boundary. Do not execute data: look the behavior up in a table keyed by name, or read the data as JSON and check it against a schema. A fixed string literal is allowed. An exception fits only when the text is trusted and cannot be a literal.
  - `{{name}}` lets YAML tags build arbitrary objects and call functions. Load YAML with the default safe schema, `yaml.load(text)` in js-yaml 4 (`JSON_SCHEMA` or `CORE_SCHEMA` for plain data), and check the result against a schema. An exception fits only when you need custom tags.
  - `{{name}}: true` compiles functions stored in the document, so a crafted document runs code. Leave it off and store plain data. An exception fits only when you must read stored functions.
  - `noent: true` expands external XML entities, so a crafted document can read local files (XXE). Leave it off, which is the default, and parse the XML as data. An exception fits only when the XML is produced by this process.

<a id="eslint-nitpicker-no-unsafe-path-join"></a>

### `eslint/nitpicker/no-unsafe-path-join`

Require a containment check when a file path is built from a parameter.

- **Printed as:** `eslint-lint/nitpicker/no-unsafe-path-join`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-unsafe-path-join","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - A path built from a parameter can leave the base directory with `../`. Resolve it into a variable and check containment on that variable in an `if` that returns or throws: `const full = path.resolve(base, name); if (!full.startsWith(base + path.sep)) { return { kind: 'outside-base' }; }`. An exception fits only when the parameter is a fixed file name.

<a id="eslint-nitpicker-no-unused-dom-environment"></a>

### `eslint/nitpicker/no-unused-dom-environment`

This test file declares {{environment}} but never uses the DOM. Change the directive to `{{directive}} node` or remove it. An exception fits only when the file uses the DOM in a way nitpicker cannot see.

- **Printed as:** `eslint-lint/nitpicker/no-unused-dom-environment`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-unused-dom-environment","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - This test file declares {{environment}} but never uses the DOM. Change the directive to `{{directive}} node` or remove it. An exception fits only when the file uses the DOM in a way nitpicker cannot see.
  - This test file declares {{environment}} but never uses the DOM, and the project default is a DOM environment too. Change the directive to `{{directive}} node`. An exception fits only when the file uses the DOM in a way nitpicker cannot see.
  - This test file runs in {{environment}}, the project default, but never uses the DOM. Add `/** @vitest-environment node */` here, or default to node and add `/** @vitest-environment {{environment}} */` to DOM tests. An exception fits only when the file uses the DOM in a way nitpicker cannot see.

<a id="eslint-nitpicker-no-unvalidated-schema-field"></a>

### `eslint/nitpicker/no-unvalidated-schema-field`

Disallow z.unknown() and z.any() as a field of a z.object schema.

- **Printed as:** `eslint-lint/nitpicker/no-unvalidated-schema-field`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-unvalidated-schema-field","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - {{factory}}() as a field only checks that the key exists and hands the value on unchecked. Validate the field in the schema, e.g. z.string().trim().min(1) or z.email(). An exception fits only when the field is genuinely opaque.
  - z.custom() without a check function is a cast, not a validator. Pass the check, z.custom\<T>((value) => ...), or build the schema from validating parts. An exception fits only when the value is genuinely opaque.
  - z.looseObject(), .loose() and .passthrough() let unknown keys through unvalidated, and .catchall(z.unknown()) does the same. Use z.object({...}), which drops unknown keys, or z.strictObject({...}) to reject them. An exception fits only when the extra keys are genuinely opaque.

<a id="eslint-nitpicker-no-wait-for-with-fake-timers"></a>

### `eslint/nitpicker/no-wait-for-with-fake-timers`

Use an explicit completion signal or advanceTimersByTimeAsync and a direct assertion; waitFor advances fake time.

- **Printed as:** `eslint-lint/nitpicker/no-wait-for-with-fake-timers` and `coding-standards/nitpicker/no-wait-for-with-fake-timers`
- **Analyzers:** `eslint-lint` and `coding-standards`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-wait-for-with-fake-timers","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Use an explicit completion signal or advanceTimersByTimeAsync and a direct assertion; waitFor advances fake time.

<a id="eslint-nitpicker-no-weak-assertion"></a>

### `eslint/nitpicker/no-weak-assertion`

Require tests to pin the value, its contents or length, and the call arguments instead of a weak check.

- **Printed as:** `eslint-lint/nitpicker/no-weak-assertion`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-weak-assertion","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `{{found}}` passes for any value but {{absent}}, the same weak check as `not.toBeNull`. Assert the value itself with `toBe` or `toEqual`, such as `expect(user).toEqual({ id: 1 })`. An exception fits only when the value cannot be pinned.
  - `{{found}}` passes for any value but {{absent}}. Assert the value itself, such as `assert.deepStrictEqual(user, { id: 1 })` or `assert.strictEqual(user.id, 1)`. An exception fits only when the value cannot be pinned.
  - `{{found}}` passes for any non-empty value. Assert the contents or the exact length, such as `expect(rows).toEqual([...])` or `expect(rows).toHaveLength(3)`. An exception fits only when the value cannot be pinned.
  - `{{found}}` passes for any non-empty value. Assert the contents or the exact length, such as `assert.deepStrictEqual(rows, [...])` or `assert.strictEqual(rows.length, 3)`. An exception fits only when the value cannot be pinned.
  - `{{found}}` passes for a call with any arguments. Pass the values the call should receive, such as `expect(spy).toHaveBeenCalledWith(orderId)`; keep `expect.any(Type)` for an argument that varies and pin the others. An exception fits only when the value cannot be pinned.

<a id="eslint-nitpicker-no-weak-hash"></a>

### `eslint/nitpicker/no-weak-hash`

Disallow MD5 and SHA-1 hashing.

- **Printed as:** `eslint-lint/nitpicker/no-weak-hash`
- **Exception:** If this is intended, add `{"rule":"nitpicker/no-weak-hash","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - {{algorithm}} is a broken hash: collisions are cheap and brute force is fast. Hash with `createHash("sha256")` (or sha384, sha512, sha3-256), sign with `createHmac("sha256", key)`, and hash passwords with `scrypt` from node:crypto, argon2 or bcrypt. An exception fits only when a protocol you do not control requires it (a legacy signature header, an ETag, a git object id).
  - HMAC with {{algorithm}} rests on MD5, which is broken and no longer approved for message authentication. Sign with `createHmac("sha256", key)`; HMAC-SHA1 is accepted where a protocol fixes it (TOTP, OAuth 1.0a). An exception fits only when a protocol you do not control requires HMAC-MD5.
  - `{{name}}` only computes MD5 or SHA-1, which are broken hashes. Use `createHash("sha256")` from node:crypto (or sha384, sha512, sha3-256), and hash passwords with `scrypt`, argon2 or bcrypt. An exception fits only when a protocol you do not control requires it.

<a id="eslint-nitpicker-preserve-error-cause"></a>

### `eslint/nitpicker/preserve-error-cause`

Preserve the original cause when wrapping a caught failure: `new AppError(message, { cause: error })`. An exception fits only when the original failure is deliberately dropped.

- **Printed as:** `eslint-lint/nitpicker/preserve-error-cause` and `coding-standards/nitpicker/preserve-error-cause`
- **Analyzers:** `eslint-lint` and `coding-standards`
- **Exception:** If this is intended, add `{"rule":"nitpicker/preserve-error-cause","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Preserve the original cause when wrapping a caught failure: `new AppError(message, { cause: error })`. An exception fits only when the original failure is deliberately dropped.
  - This catch has no binding, so the new failure loses the original cause. Bind it and pass it on: `catch (error) { throw new AppError(message, { cause: error }); }`. An exception fits only when the original failure is deliberately dropped.

<a id="eslint-nitpicker-react-controlled-input"></a>

### `eslint/nitpicker/react-controlled-input`

Disallow form fields that are both controlled and uncontrolled, or read-only by accident.

- **Printed as:** `eslint-lint/nitpicker/react-controlled-input`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Exception:** If this is intended, add `{"rule":"nitpicker/react-controlled-input","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Pass either `value` (controlled, with `onChange`) or `defaultValue` (uncontrolled), not both. An exception fits only when a form library needs both on this field.
  - A field with `value` or `checked` and no `onChange` cannot be edited. Add `onChange`, use `defaultValue`, or mark it `readOnly`. An exception fits only when a form library handles the change events.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#react)

<a id="eslint-nitpicker-react-field-has-label"></a>

### `eslint/nitpicker/react-field-has-label`

Require a label for form fields.

- **Printed as:** `eslint-lint/nitpicker/react-field-has-label`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Exception:** If this is intended, add `{"rule":"nitpicker/react-field-has-label","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Label this field: wrap it in `<label>`, give it an `id` that a `<label htmlFor>` points to, or set `aria-label`. An exception fits only when a wrapper labels it elsewhere.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#react)

<a id="eslint-nitpicker-react-no-direct-dom"></a>

### `eslint/nitpicker/react-no-direct-dom`

Disallow changing the DOM directly from a component.

- **Printed as:** `eslint-lint/nitpicker/react-no-direct-dom`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Exception:** If this is intended, add `{"rule":"nitpicker/react-no-direct-dom","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Do not query or change the page DOM directly: render the value from state or props, render into another node with `createPortal`, and reach an element through a ref (`ref.current.style`, focus, measuring); `document.documentElement` and `document.body` may change their class, style and attributes. An exception fits only for a third-party widget or a file download.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#react)

<a id="eslint-nitpicker-react-no-effect-data-fetching"></a>

### `eslint/nitpicker/react-no-effect-data-fetching`

Disallow fetching data inside useEffect.

- **Printed as:** `eslint-lint/nitpicker/react-no-effect-data-fetching`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Exception:** If this is intended, add `{"rule":"nitpicker/react-no-effect-data-fetching","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Do not fetch data in `useEffect`: it races and caches nothing. Use `useQuery` or a route loader. An exception fits only when this request is not data for rendering (an analytics beacon).
  - Do not load state asynchronously in `useEffect` (a state setter after `await` or in a `.then` callback): it races the render and nothing caches the result. Load data with `useQuery` or a route loader; run an action (a save, a clipboard write) in the event handler that causes it; redirect by rendering `<Navigate />`. An exception fits only when this effect only synchronizes with an external system.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#react)

<a id="eslint-nitpicker-react-no-effect-derived-state"></a>

### `eslint/nitpicker/react-no-effect-derived-state`

Disallow setting state from an effect body, which derives state from props or state.

- **Printed as:** `eslint-lint/nitpicker/react-no-effect-derived-state`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Exception:** If this is intended, add `{"rule":"nitpicker/react-no-effect-derived-state","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Do not set state from an effect to mirror props or state. Compute the value during render (`const total = price * quantity;`). An exception fits only when this effect synchronizes with an external system.
  - Do not reset state from an effect when a prop changes: render the component with that prop as its `key` (`<Form key={userId} />`), so React starts it with fresh state. An exception fits only when this effect synchronizes with an external system.
  - Do not copy browser storage into state from an effect: read it during render with `useSyncExternalStore(subscribe, () => localStorage.getItem(key))`, which also follows changes from other tabs. An exception fits only when this effect synchronizes with an external system.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#react)

<a id="eslint-nitpicker-react-no-effect-event-handling"></a>

### `eslint/nitpicker/react-no-effect-event-handling`

Disallow calling a prop callback from an effect that reacts to a change.

- **Printed as:** `eslint-lint/nitpicker/react-no-effect-event-handling`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Exception:** If this is intended, add `{"rule":"nitpicker/react-no-effect-event-handling","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Do not call `{{name}}` from an effect to react to a change: call it in the event handler that causes the change (`onSubmit` calls `onSave(value)`). An exception fits only when this effect synchronizes with an external system.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#react)

<a id="eslint-nitpicker-react-no-hardcoded-colors"></a>

### `eslint/nitpicker/react-no-hardcoded-colors`

Take colors from the theme or palette, not from literals.

- **Printed as:** `eslint-lint/nitpicker/react-no-hardcoded-colors`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Exception:** If this is intended, add `{"rule":"nitpicker/react-no-hardcoded-colors","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Take the color from the theme or design-system palette (a theme token, a CSS variable, or currentColor) instead of the literal {{color}}. A file that defines the palette, or a theme or palette folder, takes one glob exception (for example `src/theme/**`).
- **See also:** [Strict preset guide](../typescript-strict-preset.md#react)

<a id="eslint-nitpicker-react-no-random-key"></a>

### `eslint/nitpicker/react-no-random-key`

Disallow keys generated from randomness or the clock.

- **Printed as:** `eslint-lint/nitpicker/react-no-random-key`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Exception:** If this is intended, add `{"rule":"nitpicker/react-no-random-key","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Do not build a `key` from `{{call}}()`: it changes on every render and remounts the row. Use a stable id from the item (`key={todo.id}`) and generate ids when the item is created. An exception fits only when remounting on every render is intended.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#react)

<a id="eslint-nitpicker-react-single-styling-approach"></a>

### `eslint/nitpicker/react-single-styling-approach`

Allow one styling approach per project.

- **Printed as:** `eslint-lint/nitpicker/react-single-styling-approach`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Exception:** If this is intended, add `{"rule":"nitpicker/react-single-styling-approach","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Style with {{allowed}}, not an inline `style` object of fixed values: {{form}}. A `style` object stays for values computed at runtime, such as `{ width: progress }`. An exception fits only for a one-off.
  - Style with {{allowed}}, not an inline `style` object of fixed values: declare `const styles = StyleSheet.create({ title: { fontSize: 18 } })` at module level and pass `style={styles.title}`. A `style` object stays for values computed at runtime, such as `{ opacity: fade }`. An exception fits only for a one-off.
  - This project styles with {{allowed}}, not with {{found}}. To change the approach set "styling" under "react" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#react)

<a id="eslint-nitpicker-react-test-no-implementation-details"></a>

### `eslint/nitpicker/react-test-no-implementation-details`

Disallow React component tests that depend on component or hook internals.

- **Printed as:** `eslint-lint/nitpicker/react-test-no-implementation-details`
- **Presets:** TypeScript
- **Scope:** A TypeScript project with React: `react` in package.json or `react.enabled`.
- **Exception:** If this is intended, add `{"rule":"nitpicker/react-test-no-implementation-details","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Do not use component state or instances ({{ name }}). Assert what the user sees with `screen.getByRole(...)`.
  - Do not read React internals ({{ name }}). Assert what the user sees with `screen.getByRole(...)`.
  - Do not replace `{{ name }}` with a module mock. Assert what the user sees with `screen.getByRole(...)`, or test a custom hook with `renderHook`.
  - Do not spy on the React hook `{{ name }}`. Assert what the user sees with `screen.getByRole(...)`, or test a custom hook with `renderHook`.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#react)

<a id="eslint-nitpicker-report-module-load-effects"></a>

### `eslint/nitpicker/report-module-load-effects`

Report statements that execute observable work while a module is imported.

- **Printed as:** `eslint-module-effects/nitpicker/report-module-load-effects`
- **Analyzers:** `eslint-module-effects`
- **Exception:** If this is intended, add `{"rule":"nitpicker/report-module-load-effects","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Side-effect-only import executes code during module loading. Move the work into a function that the app entry calls. The entry (the module script in Vite's index.html, else src/main.tsx) is detected; for another entry file, list it under `layout.entryPoints` in nitpicker.config.json.
  - Static initialization block executes during module loading.
  - Top-level await delays and executes work during module loading. Move the work into a function that the app entry calls. The entry (the module script in Vite's index.html, else src/main.tsx) is detected; for another entry file, list it under `layout.entryPoints` in nitpicker.config.json.
  - Top-level {{kind}} executes control flow during module loading. Move the work into a function that the app entry calls. The entry (the module script in Vite's index.html, else src/main.tsx) is detected; for another entry file, list it under `layout.entryPoints` in nitpicker.config.json.
  - Top-level expression executes work during module loading. Move the work into a function that the app entry calls. The entry (the module script in Vite's index.html, else src/main.tsx) is detected; for another entry file, list it under `layout.entryPoints` in nitpicker.config.json.
  - `{{call}}` runs when the module is imported. Move it into a function and call that from the composition root, passing the result in. An exception fits only when it must run at import.

<a id="eslint-nitpicker-require-http-timeout"></a>

### `eslint/nitpicker/require-http-timeout`

Require a timeout on outbound HTTP calls.

- **Printed as:** `eslint-lint/nitpicker/require-http-timeout`
- **Exception:** If this is intended, add `{"rule":"nitpicker/require-http-timeout","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - {{call}} has no timeout, so a server that never answers hangs this code for good. Give it a deadline: `fetch(url, { signal: AbortSignal.timeout(10_000) })`, `axios.get(url, { timeout: 10_000 })` or `{ signal: AbortSignal.timeout(10_000) }`, `https.get(url, { timeout: 10_000 })`, `got(url, { timeout: { request: 10_000 } })`; or set it once for the client: `axios.create({ timeout: 10_000 })`, `axios.defaults.timeout = 10_000`, `got.extend({ timeout: { request: 10_000 } })`, undici `setGlobalDispatcher(new Agent({ headersTimeout: 10_000, bodyTimeout: 10_000 }))`. An exception fits only when this call is meant to wait without a limit.

<a id="eslint-nitpicker-require-test-process-timeout"></a>

### `eslint/nitpicker/require-test-process-timeout`

Require a timeout on synchronous test subprocesses.

- **Printed as:** `eslint-lint/nitpicker/require-test-process-timeout`
- **Exception:** If this is intended, add `{"rule":"nitpicker/require-test-process-timeout","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Give {{method}} a positive subprocess timeout, such as { timeout: 10_000 }. A test runner timeout cannot interrupt a synchronous child process, so a stuck command can hang the suite. An exception fits only when this process must wait without a deadline.

<a id="eslint-nitpicker-structured-catch-logging"></a>

### `eslint/nitpicker/structured-catch-logging`

Keep a caught error on the logger call in the shape the project logger reads.

- **Printed as:** `eslint-logging/nitpicker/structured-catch-logging` and `coding-standards/nitpicker/structured-catch-logging`
- **Analyzers:** `eslint-logging` and `coding-standards`
- **Exception:** If this is intended, add `{"rule":"nitpicker/structured-catch-logging","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - Log a caught value as logger.\<level>({ err: error, ...context }, message).
  - Pass the caught value itself to the logger, for example logger.error('message', error), not its message or a template string.
  - Log a caught value as logger.\<level>({ err: error, ...context }, message), or pass the caught value itself, for example logger.error('message', error).

<a id="eslint-nitpicker-test-must-use-production-runtime"></a>

### `eslint/nitpicker/test-must-use-production-runtime`

Require tests to execute a production runtime dependency.

- **Printed as:** `eslint-lint/nitpicker/test-must-use-production-runtime`
- **Exception:** If this is intended, add `{"rule":"nitpicker/test-must-use-production-runtime","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - This test imports no production code at runtime (only types, libraries, or helpers that import none). Import the code under test from the source root, directly or through a helper such as a render function that imports it. Shared helpers belong in a file not named \*.test.\* or \*.spec.\*.

<a id="eslint-nitpicker-test-tsconfig-pins-lib-and-types"></a>

### `eslint/nitpicker/test-tsconfig-pins-lib-and-types`

A tsconfig a test writes must set compilerOptions.types and compilerOptions.lib (or noLib), for example types: [] and lib: ['ES2022'], so tsc does not load every @types package and the full default lib.

- **Printed as:** `eslint-lint/nitpicker/test-tsconfig-pins-lib-and-types`
- **Exception:** If this is intended, add `{"rule":"nitpicker/test-tsconfig-pins-lib-and-types","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - A tsconfig a test writes must set compilerOptions.types and compilerOptions.lib (or noLib), for example types: [] and lib: ['ES2022'], so tsc does not load every @types package and the full default lib.

<a id="eslint-nitpicker-unbounded-fan-out"></a>

### `eslint/nitpicker/unbounded-fan-out`

Bound the concurrency of remote calls started per element.

- **Printed as:** `eslint-lint/nitpicker/unbounded-fan-out`
- **Exception:** If this is intended, add `{"rule":"nitpicker/unbounded-fan-out","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - {{combinator}} starts {{operation}}{{via}} for every element of `{{collection}}` at once, so a large collection exhausts the {{target}}'s connections or rate limit. Run each call through a limiter created once outside the loop (`const limit = pLimit(8)`, then `limit(() => send(item))`), await fixed-size chunks, or make one batch call when the API has one. An exception fits only when the collection is always small.
