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
- `languages/python/`: the nitpicker-owned ruff config (`ruff/`), the Python analyzer (`adapters/`),
  the coverage.py report ingester (`ingest/`) and the `ast`-based structure and complexity script
  (`metrics/`); it reuses the generic ingesters in `languages/java/ingest/`.
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
`test:python`), which needs the language's toolchain. CI runs the Kotlin and Python ones, in the
`kotlin-e2e` and `python-e2e` workflows, which follow the same triggers as the `typescript` workflow
below (pushes to `main` that touch the paths they list, a manual run, and the `run-ci` label).

CI (the `typescript` workflow) runs:

- on every push to `main` that touches a path in the workflow's `paths` list;
- on a pull request when someone adds the `run-ci` label, once per added label (remove and add the
  label again for another run);
- by hand from the Actions tab (Run workflow) on any branch that already has this workflow.

GitHub does not start a pull request run while the pull request has a merge conflict, so resolve it
before adding the label.

`npm test` runs `languages/python/metrics/structure_metrics.py` on a real `python3`, so it needs
`python3` 3.10 or newer on the `PATH` (that test file is skipped, with its reason in the name,
without one). The Python end-to-end suite (`npm run test:python`) needs more tools and the
network; see [docs/python-preset.md](docs/python-preset.md).

To cut a release, see [docs/releasing.md](docs/releasing.md).
