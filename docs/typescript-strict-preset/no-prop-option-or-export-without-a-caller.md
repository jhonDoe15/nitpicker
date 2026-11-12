# No prop, option or export without a caller

Part of the [TypeScript strict preset guide](../typescript-strict-preset.md).

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
  entries and test-runner plugins, the Node.js plugin's `node --test` patterns among them (scripts
  in `package.json`, tool configs such as `vite.config.ts`, `bin` and `exports` stay entries) lists
  what production code does not use, and what the normal run does not list is used only by tests. That covers whole modules too: a module
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

# Design signals

The `structure` check also builds the design facts (`modules`, `types`, `callables`) of the
production sources from a second type-checked program (test files left out) and runs the deep-module
design rules over them (`mutable-state-escape`, `context-threading`, `caller-protocol`, `protocol-contract`,
`forwarding-chain`, `disjoint-consumer-groups`, `data-clump`, `repeated-policy-decision`,
`foreign-state-decision`). They are report-only review signals, except `mutable-state-escape` and
`protocol-contract` (the violations of a `protocols` contract in `nitpicker.config.json`), which are enforceable. The JavaScript
preset runs them too: JSDoc types count, and a callable without a declared type leaves that part of the
fact out, so fewer signals fire than in TypeScript. A call is a fact only when TypeScript resolves it to
one declaration of the project (a union or interface receiver is left out), and a failure of the
analysis is a tool error of `structure` with the rule `design-signals`. In a published package, what its entry points export (through re-exports) is its public surface: the rules that judge an API's shape skip it, since its callers live outside the project. Exceptions use the rule ids of
the design rules.
