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

```sh
npm ci
npm test
node core/cli.mjs --base origin/main
```

`npm test` runs `languages/python/metrics/structure_metrics.py` on a real `python3`, so it needs
`python3` 3.10 or newer on the `PATH` (that test file is skipped, with its reason in the name,
without one). The Python end-to-end suite (`npm run test:python`) needs more tools and the
network; see [docs/python-preset.md](docs/python-preset.md).

The last command is the self-gate CI runs: nitpicker checks its own changes against `main`.
Run everything locally before pushing.

To cut a release, see [docs/releasing.md](docs/releasing.md).
