# Slice 5: duplicates, coupling and import contracts

Part of the [Python preset guide](../python-preset.md).

All three read only the production sources under `python.sourceRoots`. A file is not production
code when it is `test_*.py`, `*_test.py`, `tests.py` or `conftest.py`, or sits under a directory
named `tests`, `test` (or a top-level `testing`), `migrations`, `build`, `dist`, `venv`, `site-packages`, `node_modules`, `__pycache__` or a
hidden one such as `.venv`; the same list feeds jscpd's `--ignore`, the import scan and the module
list. Only the duplicate scan can be changed: `duplicates.skippedFolders` replaces `tests`, `test`,
`migrations`, `build` and `dist` there (the other names and the test file patterns always apply),
so a package really called `build` can be scanned for clones. When the source root is `.` (a flat project without packages, or `python.sourceRoots`
saying so), the top-level `docs`, `doc`, `examples` and `scripts` directories are skipped too, as
the source root detection already does.

- **Duplicates.** jscpd (nitpicker's own pinned copy, `jscpd@x.y.z` in the analyzer version) runs
  once over all existing source roots with `--format python --mode mild` and a nitpicker-owned
  config (`jscpd-config.json` in the report directory: 50 tokens, 5 lines, no threshold), so a
  `.jscpd.json` of the project neither changes the result nor fails the run, and clones between
  sibling packages (`billing/` and `shipping/`) are found. The report goes through the same
  `runJscpd` and `evaluateDuplicates` the Java preset uses, so the findings are identical in shape:
  `duplicate-clone` (enforceable, one per clone) and `duplicate-clone-size` (descriptive `lines` and
  `tokens`), tool name `duplicates`. Identity is the sorted file pair, a hash of the cloned text and
  the n-th occurrence of that text in the pair, never a line, so moving a legacy clone within its files keeps it
  baselined; a legacy clone that shrank or split is held at its base token count while most of each copy
  is unchanged code that was part of that base clone. Clones that consist only of import statements or `__all__` re-export lists are dropped
  (`importsOnly` in `core/tooling/jscpd/import-only/`, the same check the other languages use for
  their import lines); a clone that also carries code is still reported. The finding is on the first
  file of the pair, and its message names both files and tells to add either one to `exclude` when
  the repetition is intended. An `exclude` glob or a `python.exceptions` entry for `duplicate-clone`
  that matches either file of the pair lifts the finding. A source root of `.` is supported.
  A second jscpd run (100 tokens, 5 lines, `jscpd-renamed-config.json`) goes over a normalized copy
  of the project's Python files, where names, strings, numbers and comments are one token each,
  imports, `__all__` and literal-only lists, dicts and tuples are blanked and generated files are left
  out, so a copy with renamed locals and changed literals is found: `duplicate-clone` with an
  identity starting `renamed:`, the same message, lifted by the same `exclude` glob or
  `python.exceptions` entry. It replaces a plain jscpd clone over the same two ranges and drops
  clones made of class, field and enum member declarations only, and clones that only repeat one or
  two statements (mapper calls, `add_argument` lists); dicts keyed by qualified names
  (`Status.NEW: "new"`) are data. Findings are mapped back to the original lines
  because the copy keeps every line break.
- **Coupling.** `python -I languages/python/adapters/import-scan.py` (the project's interpreter,
  standard library only) parses every production file with `ast` and prints each file's `import`
  and `from ... import` statements, including those inside functions and `if TYPE_CHECKING:`
  blocks, which it marks `typeOnly` (the body of an `if TYPE_CHECKING:`, where the flag is `TYPE_CHECKING`
  imported from `typing` or `typing_extensions` (also under an alias or as `typing.TYPE_CHECKING`) or
  the module-level `TYPE_CHECKING = False` idiom, alone or in an `and` condition; any other
  `TYPE_CHECKING`, such as `foo.TYPE_CHECKING` or one imported from another module, is an ordinary name; its `else` branch is runtime code, and the `else` branch of `if not TYPE_CHECKING:` is type-only). Everything else is JavaScript (`python-coupling.mjs`) so it is unit-tested without Python:
  a module is a `.py` file named relative to its import root (`a/b.py` is `a.b`, `a/__init__.py` is
  `a`), a package is the module's containing package (a package's `__init__` belongs to the package
  itself, a top-level module to `(root)`), relative imports are resolved against the importing
  module, and an import is an edge to the longest module the sources define (`import a.b.c.Thing`
  links `a.b.c`; `from a import b` links `a.b` when that is a module, else `a`). An edge is type-only
  when every import that makes it is under `if TYPE_CHECKING:`. Type-only edges count in every
  metric (fan-in, fan-out, instability, package cohesion and the dependency count), but the
  enforceable `stability-direction` rule never reports one as the inverted dependency, so a stable
  package that imports an unstable one only for annotations is not an inversion. TypeScript
  applies the same rule to `import type` edges. Imports of anything
  outside the sources (the standard library, third-party packages) are not edges. The graph goes to
  the shared `buildCouplingReport`, which the Java preset now uses too, and then `evaluateCoupling`:
  report-only `coupling`, `module-coupling`, `package-coupling`, `stability-direction-metric`, and
  the enforceable `stability-direction` (`<package> depends on less stable package <package>`),
  tool name `coupling`, identity `package-edge:<source>-><target>`. Its path is the source
  package's `__init__.py` (the package's first file when it has none), and the message says to
  depend on an abstraction in a more stable package, and ends with the `python.exceptions` entry for that
  file, for when the inversion is intended. An edge can appear without anyone touching it, because package
  instability moves when other packages change; such a finding names the changed files that
  moved it. Under a feature root a feature is one unit: its `__init__.py` re-exporting its own
  `domain` and `adapters` is not an inversion, and an edge to another feature or package is
  measured between whole units and reported on the feature folder, or on the `__init__.py` of a
  package that depends on a feature, with a message that names both units (see
  [Stability direction](../usage.md#stability-direction)). Outside features, as in Java, packages
  are flat (`a.b` and `a.b.c` are different packages) and fan-in and fan-out count distinct files. A file
  that does not parse with the interpreter is left out of the graph (ruff already reports syntax
  errors), so one legacy Python 2 file does not break the gate.
- **import-linter and `TYPE_CHECKING`.** import-linter counts imports under `if TYPE_CHECKING:` as
  imports unless the project's contract config sets `exclude_type_checking_imports = True` in its
  `[importlinter]` section. Nitpicker does not override the project's
  contracts, so set it there when type-only imports should not break a contract.
- **grimp or an `ast` scan?** An `ast` scan, shipped with nitpicker. grimp must be installed into
  the project's environment, which nitpicker never modifies, needs the root packages to be
  importable (editable installs and `PYTHONPATH` become part of the contract), and would add a
  Rust dependency only to produce what a few dozen lines of `ast` already give: module-to-module import
  edges. What grimp adds (external packages, import chains, squashed packages) is import-linter's
  job, and import-linter, which brings grimp, runs when the project uses it.
- **import-linter.** When the snapshot has an import-linter config, found the way import-linter
  finds it (the first of `setup.cfg` and `.importlinter` with an `[importlinter]` section, then
  `[tool.importlinter]` in `pyproject.toml`; import-linter never reads `tox.ini`),
  `lint-imports --no-cache` runs in the project's environment, with the
  snapshot's sources on `PYTHONPATH` as for the other tools. The project's `import-linter` version
  (read from the installed package metadata, since `--version` only exists from 2.11) is part of
  the analyzer version. `python.importLinter` overrides the detection (`false` never runs it,
  `true` always does). import-linter 1.12 or newer is supported (the first with `--no-cache`); the
  startup logo is not suppressed because `--no-logo` only exists from 2.14, and the parser skips
  it. It has no machine-readable output, so the text report is parsed
  (`languages/python/ingest/import-linter.mjs`, tested on real output of the forbidden, layers,
  independence, protected and acyclic contracts): every import chain in the `Broken contracts`
  section is one enforceable `contract-broken` finding, tool `import-linter`, on the file of the
  chain's first module with the line of its first import, identity
  `contract:<name>:<module> -> <module> -> ...` (no line numbers, so a legacy broken contract stays
  baselined when lines move). A hop prints either `(l.1, 2, 3)` or `(l.1, l.2, l.3)` depending on the
  version; both are read. Items of contract types that do not print import chains (acyclic
  siblings) are reported by their text, and a broken contract with nothing readable is one finding
  for the contract; these have path `.`, so their message says only to remove the import. Findings
  on a file end with the `python.exceptions` sentence for `contract-broken`. A run that checked no
  contract (missing config file, `lint-imports` not installed in the environment, which the
  message answers with `"python": { "importLinter": false }`) is an `import-linter-failed` tool
  error, as `duplicates-failed` and `coupling-failed` are for the other two steps. There is no
  `tools.import-linter`: the contracts are the project's own and nitpicker has none to layer them
  on, so they run as written. Each snapshot runs its own contracts (the base cannot run contracts
  for modules only the head has), so the policy review compares the contracts of the two sides,
  contract by contract (by the `importlinter:<kind>:<id>` section name, or the `id` or `name` of a
  `pyproject.toml` contract), with or without any opt-in. What weakens the check fails until a
  person accepts it: the config removed (the file deleted, the section renamed or the table
  dropped), a contract removed, a layer dropped or the layers reordered, an entry dropped from
  `source_modules`, `forbidden_modules`, `modules`, `containers`, `protected_modules` or
  `root_packages`, an entry added to `ignore_imports`, `allowed_importers` or `exhaustive_ignores`,
  `allow_indirect_imports` or `exclude_type_checking_imports` turned on, `exhaustive` or
  `as_packages` turned off, `unmatched_ignore_imports_alerting` relaxed (`error`, then `warn`, then
  `none`), and any other changed key except `name`. What only adds checking is listed and does not
  fail: the config or a contract added, a layer or module added, an ignored import removed.
  Comments, layout and the other sections do not count. With `"python": { "importLinter": false }`
  the contracts neither run nor count, and a change that turns them back on lists them as added.
- **Policy.** `duplicate-clone` and `stability-direction` are enforced for Python in
  `shared/policy.mjs` (`spec/checks.md`). `contract-broken` is a Python-only tool rule and has no
  shared policy entry.
