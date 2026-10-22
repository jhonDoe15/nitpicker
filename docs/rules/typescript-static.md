# TypeScript and JavaScript: static checks

Prettier, the TypeScript compiler, the dependency-cruiser architecture rules, the entry-point check and the coding-standards checks. This page lists 16 rules. [All pages](README.md).

The guide for these rules: [docs/typescript-strict-preset.md](../typescript-strict-preset.md).

Unless an entry says otherwise:

- **Presets:** TypeScript and JavaScript
- **Analyzers:** `dependency-architecture`
- **Why it is on:** dependency-cruiser checks the import graph of the production code against the architecture rules of the strict preset.

<a id="dependency-architecture-domain-does-not-import-adapters"></a>

### `dependency-architecture/domain-does-not-import-adapters`

Domain does not import adapters.

- **Allowed form:** domain/ stays pure and may not import adapters/. Define the dependency as a type in domain/ and let adapters/ implement it. An exception fits only when it is deliberate; its paths are the importing files.
- **Exception:** If this is intended, add `{"rule":"domain-does-not-import-adapters","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#layout-and-boundaries)

<a id="dependency-architecture-domain-does-not-import-id-libraries"></a>

### `dependency-architecture/domain-does-not-import-id-libraries`

Domain does not import id libraries.

- **Allowed form:** domain/ may not import ID or random-data libraries (uuid, nanoid, cuid, ulid, faker). Take the ID as a parameter from adapters/. An exception fits only when it is deliberate; its paths are the importing files.
- **Exception:** If this is intended, add `{"rule":"domain-does-not-import-id-libraries","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#layout-and-boundaries)

<a id="dependency-architecture-domain-does-not-import-module-state"></a>

### `dependency-architecture/domain-does-not-import-module-state`

Domain does not import module state.

- **Allowed form:** domain/ may not import module state (state/, *-state, *-store files). Receive the state as a parameter and return the new value. An exception fits only when it is deliberate; its paths are the importing files.
- **Exception:** If this is intended, add `{"rule":"domain-does-not-import-module-state","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#layout-and-boundaries)

<a id="dependency-architecture-domain-does-not-import-network-or-database-clients"></a>

### `dependency-architecture/domain-does-not-import-network-or-database-clients`

Domain does not import network or database clients.

- **Allowed form:** domain/ may not import network or database clients. Call the client from adapters/ and pass the data into domain/ as a parameter. An exception fits only when it is deliberate; its paths are the importing files.
- **Exception:** If this is intended, add `{"rule":"domain-does-not-import-network-or-database-clients","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#layout-and-boundaries)

<a id="dependency-architecture-domain-does-not-import-node-io"></a>

### `dependency-architecture/domain-does-not-import-node-io`

Domain does not import node io.

- **Allowed form:** domain/ may import only pure Node modules (path, url, util, assert, buffer, events, string_decoder, punycode, querystring, and their subpaths such as path/posix). Do the I/O in adapters/ and pass the result in as a parameter. An exception fits only when it is deliberate; its paths are the importing files.
- **Exception:** If this is intended, add `{"rule":"domain-does-not-import-node-io","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#layout-and-boundaries)

<a id="dependency-architecture-domain-does-not-import-the-logger"></a>

### `dependency-architecture/domain-does-not-import-the-logger`

Domain does not import the logger.

- **Allowed form:** domain/ may not import the logger. Return a result describing what happened and let adapters/ log it. An exception fits only when it is deliberate; its paths are the importing files.
- **Exception:** If this is intended, add `{"rule":"domain-does-not-import-the-logger","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#layout-and-boundaries)

<a id="dependency-architecture-domain-does-not-reach-io-through-shared"></a>

### `dependency-architecture/domain-does-not-reach-io-through-shared`

Domain does not reach io through shared.

- **Allowed form:** domain/ reaches Node I/O or a client through a shared/ module it imports. Move that dependency out of the shared module, or do the work in adapters/ and pass the result into domain/ as a parameter. An exception fits only when it is deliberate; its paths are the importing files.
- **Exception:** If this is intended, add `{"rule":"domain-does-not-reach-io-through-shared","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#layout-and-boundaries)

<a id="dependency-architecture-feature-internals-only-through-index"></a>

### `dependency-architecture/feature-internals-only-through-index`

Feature internals only through index.

- **Allowed form:** Import a feature only through its public index.ts (src/main/features/<name>/index.ts), not its internal files.
- **Exception:** If this is intended, add `{"rule":"feature-internals-only-through-index","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#layout-and-boundaries)

<a id="dependency-architecture-features-do-not-import-composition-root"></a>

### `dependency-architecture/features-do-not-import-composition-root`

Features do not import composition root.

- **Allowed form:** Features do not import the composition root. Accept the dependency as a parameter; only the composition root wires features together.
- **Exception:** If this is intended, add `{"rule":"features-do-not-import-composition-root","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#layout-and-boundaries)

<a id="dependency-architecture-features-do-not-import-other-feature-internals"></a>

### `dependency-architecture/features-do-not-import-other-feature-internals`

Features do not import other feature internals.

- **Allowed form:** Import another feature only through its public index.ts (src/main/features/<name>/index.ts), not its internal files.
- **Exception:** If this is intended, add `{"rule":"features-do-not-import-other-feature-internals","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#layout-and-boundaries)

<a id="dependency-architecture-no-import-outside-roots"></a>

### `dependency-architecture/no-import-outside-roots`

No import outside roots.

- **Allowed form:** Production code imports only from layout.sourceRoots: move the imported code under a source root, or add its folder to layout.sourceRoots so the gate checks it. Excluding the imported file instead is a policy loosening that fails until a person accepts it.
- **Exception:** It has no exception: move the code under a source root, or add its folder to `layout.sourceRoots`.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#layout-and-boundaries)

<a id="dependency-architecture-no-production-cycles"></a>

### `dependency-architecture/no-production-cycles`

Production modules import each other in a cycle.

- **Why it is on:** A cycle makes modules impossible to load, test or replace one at a time.
- **Allowed form:** Break the cycle: move the shared part to a module both import, or pass the dependency in as a parameter.
- **Exception:** If this is intended, add `{"rule":"no-production-cycles","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#layout-and-boundaries)

<a id="dependency-architecture-no-production-to-test"></a>

### `dependency-architecture/no-production-to-test`

Production code imports a test file or a file under a test root.

- **Why it is on:** Code that ships must not depend on code that only tests use.
- **Allowed form:** Move what both need to a production module, or keep the import in a test.
- **Exception:** If this is intended, add `{"rule":"no-production-to-test","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#layout-and-boundaries)

<a id="dependency-architecture-shared-does-not-import-features"></a>

### `dependency-architecture/shared-does-not-import-features`

Shared does not import features.

- **Allowed form:** Shared code does not import features. Move the dependency into the feature, or pass it in as a parameter from the composition root.
- **Exception:** If this is intended, add `{"rule":"shared-does-not-import-features","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Strict preset guide](../typescript-strict-preset.md#layout-and-boundaries)

<a id="prettier-format-prettier-prettier"></a>

### `prettier-format/prettier/prettier`

Lines that Prettier would format differently.

- **Analyzers:** `prettier-format`
- **Why it is on:** One layout for every file, so that reviews are about the code and not its formatting.
- **Allowed form:** Run Prettier on the file; `nitpicker fix` does it for the files a change touched.
- **Exception:** If this is intended, add `{"rule":"prettier/prettier","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="typescript-typecheck-ts-code"></a>

### `typescript-typecheck/TS<code>`

A TypeScript compiler error, with the compiler code (`TS2322`).

- **Printed as:** `typescript-typecheck/TS<code>`
- **Analyzers:** `typescript-typecheck`
- **Why it is on:** The project type-checks under the strictest compiler options of the preset.
- **Allowed form:** Fix the type error.
- **Exception:** A compiler error has no exception: fix the type error. A config entry for one is rejected.
