# Python preset

Status: slices 1, 2, 3, 4, 5 and 6 (tickets PY1, PY2, PY3, PY4, PY5 and PY6) implemented; the others are planned below.
The scope is a proposal pending owner review.

The Python preset runs the same differential gate as the TypeScript and Java presets on a Python
project: run the tools on the merge base and on head, turn each report into findings
([`spec/findings.schema.json`](../spec/findings.schema.json)), and fail only on new enforceable
findings. The comparison is the language-neutral core (`compareFindings`, rename map from git),
which the conformance suite in [`spec/conformance`](../spec/conformance/README.md) covers. The
Python side contributes only two things: producing reports inside the project's own environment,
and converting them into findings.

The Python and `uv` (or poetry) setup a CI job needs, and recipes for GitHub Actions, GitLab CI and
Jenkins, are in [nitpicker in CI](ci.md#toolchains-by-preset).

The purpose is the same as everywhere else: narrow a flexible language to roughly one allowed way
of doing each thing. That "one way" lives in the code and architecture rules (slices 2 to 5), not in
which tools a project uses, so the preset detects the tools a project already has (uv, poetry,
pipenv, hatch, conda or a plain virtualenv; ruff or black; pytest, unittest, Django's `manage.py test` or nose2) and never makes adoption depend on switching.

Every rule the preset can report has an entry in the [rule reference](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/README.md): [ruff](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/python-ruff.md), [nitpicker's own rules](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/python-nitpicker.md) and [the type checkers and import contracts](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/python-types.md), with the allowed form and the `exceptions` entry of each. `nitpicker explain <tool/rule>` prints an entry.

## Contents

Each topic has its own page, so two changes to different topics never edit the same file.

- [How it works](python-preset/how-it-works.md)
- [The project's own environment](python-preset/the-projects-own-environment.md)
- [Configuration](python-preset/configuration.md)
- [Slice 2: type checking and the one-way rules](python-preset/slice-2-type-checking-and-the-one-way-rules.md)
  - [The shared one-way rules](python-preset/the-shared-one-way-rules.md)
  - [Rules from code review](python-preset/rules-from-code-review.md)
  - [Slow tests](python-preset/slow-tests.md)
  - [New console output from tests](python-preset/new-console-output-from-tests.md)
  - [Cancellation propagation](python-preset/cancellation-propagation.md)
- [Slice 1: tools, reports and identities](python-preset/slice-1-tools-reports-and-identities.md)
- [Slice 3: structure limits and CRAP](python-preset/slice-3-structure-limits-and-crap.md)
- [Slice 4: gate on changed branch coverage](python-preset/slice-4-gate-on-changed-branch-coverage.md)
- [Slice 5: duplicates, coupling and import contracts](python-preset/slice-5-duplicates-coupling-and-import-contracts.md)
- [Slice 6: mutation testing](python-preset/slice-6-mutation-testing.md)
- [Runner parity](python-preset/runner-parity.md)
- [Design rules](python-preset/design-rules.md)
- [Feature folders](python-preset/feature-folders.md)
- [Slices](python-preset/slices.md)
- [Tests](python-preset/tests.md)
- [Troubleshooting](python-preset/troubleshooting.md)
