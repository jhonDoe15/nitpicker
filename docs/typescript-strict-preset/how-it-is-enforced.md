# How it is enforced

Part of the [TypeScript strict preset guide](../typescript-strict-preset.md).

- `languages/typescript/preset/defaults/eslint.config.mjs` (the `eslint-lint` analyzer) adds `strictPresetConfig()` from
  `languages/typescript/preset/eslint-config/strict.mjs` to typescript-eslint's strict type-checked config. Rules that
  strict replaces are removed: `consistent-type-assertions`, `explicit-member-accessibility` and
  `no-unsafe-type-assertion` (the `as`, class and member bans cover them), and `no-explicit-any` and
  `no-non-null-assertion` are off in production code because the strict selectors report the same
  sites with a message that names the allowed form.
- A project that opts in with `tools.eslint.precedence` has its own `eslint.config.*` layered over these
  configs (`layeredPolicy` in `languages/typescript/adapters/lint-engine/project-layer.mjs`), on both lint
  engines and for the JavaScript preset too. It can add rules and tune nitpicker's, only on the files
  nitpicker runs each rule on, and never switch one of them off. Its `no-restricted-syntax`,
  `no-restricted-globals` and `no-restricted-properties` entries are added to nitpicker's, and a `max-*`
  or `complexity` limit takes the lower of the two. Any other options replace nitpicker's for the files
  the entry matches, which can weaken a rule (`allowEmptyCatch: true` for `no-empty`), so the policy
  review lists each nitpicker rule whose options the project replaces; see
  [ESLint configs](../usage.md#eslint-configs-typescript-and-javascript-presets).
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
- The server scope lives in `languages/typescript/preset/eslint-config/server/server-scope.mjs`; see
  "Server code" above. Its rule, `nitpicker/no-local-time-zone`, is a strict rule too.
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
  each finding prints the entry. See [Exceptions for rules nitpicker adds](../usage.md#exceptions-for-rules-nitpicker-adds).
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
  When feature roots nest, a file belongs to the innermost one. A folder a configured `sharedRoots`
  glob matches is shared even inside a feature folder; while `sharedRoots` is not set, a folder the
  default shared root matches inside a feature folder is part of that feature, so
  `shared-used-by-one-feature` does not report its modules. A configured glob that matches no
  folder is named in a notice.
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
  like every other test file (see [Test runners](../usage.md#test-runners)).
