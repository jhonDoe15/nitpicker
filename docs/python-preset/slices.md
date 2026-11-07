# Slices

Part of the [Python preset guide](../python-preset.md).

Each slice is one PR, adds one concern, and changes the Python adapters, ingesters or rules, tests,
and this document. Slice 1 also made the config validation, the preset wiring in `core/` and the
exclude and legacy-inventory policy (`applyFindingPolicy`) serve more than one language.

| #   | Ticket                                                    | Slice                        | Tool and report                                                      | Findings                                                                                          | Status |
| --- | --------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| PY1 | [#168](https://github.com/jhonDoe15/nitpicker/issues/168) | Base runner and CLI          | ruff, ruff format or black, pytest or unittest under coverage.py     | lint and format findings, `line-coverage`, `uncovered-function`, `tool-error`                     | done   |
| PY2 | [#169](https://github.com/jhonDoe15/nitpicker/issues/169) | Type checking, one-way rules | mypy or pyright; ruff rules and import rules for the one allowed way | type errors; one-way rules with their failure messages; the Python skill                          | done   |
| PY3 | [#170](https://github.com/jhonDoe15/nitpicker/issues/170) | Structure limits and CRAP    | `ast` metrics script and complexity, joined with the coverage report | `function-*-limit` rules as for TypeScript and Java; `crap-score-limit`, `crap-coverage-unknown`  | done   |
| PY4 | [#171](https://github.com/jhonDoe15/nitpicker/issues/171) | Changed-branch coverage      | the coverage JSON branch data and the changed lines from git         | `changed-branch-coverage`                                                                         | done   |
| PY5 | [#172](https://github.com/jhonDoe15/nitpicker/issues/172) | Duplicates and coupling      | jscpd with the `python` format; import graph for stability           | `duplicate-clone`, `duplicate-clone-size`; `stability-direction`; import-linter `contract-broken` | done   |
| PY6 | [#173](https://github.com/jhonDoe15/nitpicker/issues/173) | Mutation testing             | mutmut 3 run data, per docs/mutation-testing                         | `mutant-survived`, `mutant-nocoverage` (new surviving mutants fail)                               | done   |

Slice order follows what each one needs: PY2 to PY6 all reuse PY1's environment detection and
snapshot handling, PY3 and PY4 reuse its coverage report, and PY6 is last because it is the
slowest and needs the tests to pass reliably under the environment PY1 established. The custom
rules each slice adds are listed in [`spec/checks.md`](../../spec/checks.md) (generated from
`shared/policy.mjs`) when they become enforced for Python; PY1 adds none, PY3 adds the six structure
and CRAP rules.
