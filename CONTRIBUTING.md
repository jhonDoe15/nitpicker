# Contributing

Before adding, loosening or removing a rule, read [docs/mindset.md](docs/mindset.md).

## Repository layout

One npm package (`nitpicker`) serves every language; the package root is the repository root.

- `core/`: the engine (base/head comparison, fingerprinting, scheduling, reports, the CLI) and the
  tool helpers every language shares (`core/tooling/`).
- `shared/`: language-neutral policy and custom rules. It imports neither `core/` nor `languages/`.
- `languages/typescript/`: the ESLint/strict preset (`preset/`) and the TypeScript analyzers
  (`adapters/`).
- `languages/javascript/`: what the JavaScript preset changes in the TypeScript pipeline (JSDoc
  rules, ESLint dialect, preset constants) and its `js-clean` fixture.
- `languages/java/`: the Gradle init script and `StructureMetrics.java` (`gradle/`), the Java
  analyzer (`adapters/`) and the report ingesters (`ingest/`). The Kotlin preset is the same code
  with Kotlin tools added (`kotlin-*.mjs`).
- `languages/python/`: the nitpicker-owned ruff config (`ruff/`), the Python analyzer (`adapters/`)
  and the coverage.py report ingester (`ingest/`); it reuses the generic ingesters in
  `languages/java/ingest/`.
- `spec/`, `docs/`, `evals/` and `scripts/`: the language-neutral contract, documentation,
  agent evaluations and maintenance scripts. Not shipped.

Source files carry no comments; formats and protocols that names cannot express are in
[docs/internals.md](docs/internals.md).

## Running the checks

Pull requests do not run CI on every push. Check your change locally before you push it and again
before it is merged:

```sh
npm ci
git fetch origin main
npm run check
```

`npm run check` runs the self-gate (nitpicker checks your change against the remote's default
branch) and then the full test suite, and fails if either fails. Arguments after `--` go to vitest,
so `npm run check -- --maxWorkers=2` matches CI's worker count. It needs Node.js 22.14 or newer (CI
uses 24) and Java 21 for the structure-metrics test. It checks your working tree, uncommitted and
untracked files included, while CI checks the pull request merged into its target branch, so commit
everything and merge or rebase on the latest `main` before the final run. A change to a language's
end-to-end behaviour also needs that language's suite (`npm run test:java`, `test:kotlin` or
`test:python`), which needs the language's toolchain and does not run in CI.

CI (the `typescript` workflow) runs:

- on every push to `main` that touches a path in the workflow's `paths` list;
- on a pull request when someone adds the `run-ci` label, once per added label (remove and add the
  label again for another run);
- by hand from the Actions tab (Run workflow) on any branch that already has this workflow.

GitHub does not start a pull request run while the pull request has a merge conflict, so resolve it
before adding the label.

## Licenses

Code nitpicker writes or copies stays permissive (MIT, Apache-2.0, BSD, ISC). A tool nitpicker runs
unmodified, either downloaded at run time or installed as an unmodified npm package, may be
weak-copyleft (LGPL, EPL, MPL). GPL, AGPL and source-available licenses (SSPL, SSALv1, BSL,
Elastic and the like) are never allowed, in either form.

Weak-copyleft tools today: SpotBugs and its find-sec-bugs plugin, and Checkstyle (LGPL); JaCoCo
(EPL); axe-core, which `eslint-plugin-jsx-a11y-x` installs (MPL-2.0).

`core/licensing/dependency-licenses.test.mjs` enforces this on every test run. It reads the license
field and the LICENSE file of every npm package nitpicker ships (the whole dependency tree, not just
`package.json`) and checks every tool pinned in `languages/java/gradle/nitpicker.init.gradle` against
the allowlist in `core/licensing/`. Adding a pinned Java tool means adding its license to that list
in the same change, after reading the license text, since a package's metadata can disagree with
its LICENSE file.

To cut a release, see [docs/releasing.md](docs/releasing.md).
