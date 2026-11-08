# How it works

Part of the [Python preset guide](../python-preset.md).

```
node languages/python/adapters/python-runner.mjs --part python     (analyzer python, per snapshot)
  -> ruff check  --config nitpicker-ruff.toml      -> ruff.sarif
  -> ruff format --check --diff | black --check    -> format.txt
  -> coverage run -m pytest | unittest | nose2, or manage.py test -> coverage.json (coverage.py JSON)
  -> mypy --strict | pyright | basedpyright (strict) -> type-check.json
  -> python -I nitpicker_rules.py                  -> rules.json     (the small AST checks)
  -> python structure_metrics.py                    -> structure.json  (slice 3; also the CRAP input)
  -> jscpd --format python (all source roots at once) -> duplicates.json
  -> python import-scan.py (stdlib ast)            -> imports.json    (modules and their imports)
  -> lint-imports (only with an import-linter config) -> import-linter.txt
  -> readPythonFindings                             (languages/python/adapters/python-reports.mjs)
node languages/python/adapters/python-runner.mjs --part mutation   (analyzer mutation, after python)
  -> mutmut run                                    -> findings read from mutmut's mutants/
compareFindings(base, head, renames) per analyzer   (core)
```

Reports are written to a temporary directory outside the project and removed afterwards, so
nothing is added to the analyzed tree (no caches, no `.coverage` file, no bytecode). That
directory is the contract between the tool runs and the readers; later slices add files to it.

- **Selection.** Explicit only: `"preset": "python"` in `nitpicker.config.json`. There is no
  auto-detection of `pyproject.toml`. `nitpicker` finds the project from the nearest directory with
  a `package.json` or a `nitpicker.config.json`, so a Python project needs no `package.json`.
- **Two analyzers.** `python` carries the findings of the tools named `ruff`, `ruff-format` or
  `black`, `coverage`, `mypy`, `pyright` or `basedpyright`, and `python-rules`; `mutation` (slice 6) carries those of `mutmut` and depends on `python`,
  so it runs after it and is skipped when it had a tool error. They are separate so that a missing
  or crashing mutmut costs only the mutation results, and `"disable": ["mutation"]` turns it off.
  Disabling `python` turns `mutation` off too, because `mutation` depends on it. The version is the versions of the tools in the
  project's environment (`ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;pytest@8.3.1`), read from the live checkout, and
  the configuration hash covers the Python adapter files, the nitpicker-owned ruff config and the
  `python` settings. Upgrading ruff, or editing the preset, therefore invalidates the base cache.
- **Ingesters.** The generic ingesters live in `shared/ingest/` and are shared with the Gradle
  presets: `sarif.mjs` (ruff, with `prepareSarif`), `format-check.mjs` (the format check), `common.mjs` and
  `lizard-crap.mjs`.
  The one new ingester is `languages/python/ingest/coverage-reports/coverage-json.mjs` for the coverage.py JSON
  report. The legacy-inventory and `exclude` handling is `applyFindingPolicy` in
  `shared/findings/finding-policy.mjs` and Java's `configureJavaAnalyzer`, which are language-neutral and
  take the tool name for a `baseline-expansion` finding as an option.
