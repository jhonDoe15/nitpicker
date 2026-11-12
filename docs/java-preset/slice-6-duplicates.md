# Slice 6: duplicates

Part of the [Java preset guide](../java-preset.md).

- **Where it runs.** jscpd is a Node tool, so it is not in the Gradle init script (which this slice
  does not touch). After the Gradle task has written `manifest.json` in the report directory,
  `languages/java/adapters/metrics/java-duplicates.mjs` runs the package's own pinned jscpd (`runJscpd` in
  `core/tooling/jscpd/run-jscpd.mjs`, shared with Python and the one the TypeScript `duplicates`
  check uses; its version is appended to the analyzer version as `jscpd@x.y.z`) once per existing
  main source root with `--format java --mode mild` and a nitpicker-owned `--config` (a project's
  `.jscpd.json` is not read). It ignores the folders named `build`, `generated`, `target` and `out`
  at any depth; the config key `duplicates.skippedFolders` replaces this list (an empty list
  ignores nothing) and reaches the runner as `--duplicate-skipped-folders`. Clones made only of
  `package` and `import` lines (the clone may end on the line where the following declaration
  starts) are not reported (`core/tooling/jscpd/import-only/jvm-imports.mjs`). The message names
  both files and tells to add either to `exclude`, and a glob that matches either file of the pair
  lifts the finding. It runs once for the whole build, over the source roots of every Gradle project.
  Reports go to `jscpd/<n>/` in the report directory and are merged into its `duplicates.json`.
  Clones across two source roots, and so across two Gradle projects, are not detected (running jscpd once over all roots would detect them, at the price of changing the identity of every existing Java clone finding). A jscpd
  failure is a tool error like a Gradle failure.
- **Findings.** The same normalizer as the TypeScript check (`normalizeDuplicates`), tool name
  `duplicates`: `duplicate-clone` (enforceable, one per clone) and `duplicate-clone-size`
  (descriptive metrics `lines` and `tokens`). There is no extra threshold:
  jscpd's defaults (5 lines, 50 tokens) apply, as for TypeScript.
- **Renamed copies.** A second jscpd run (100 tokens, 5 lines), on Gradle and Maven alike, goes over
  a normalized copy of the `.java` files of each source root, where names, strings, characters,
  numbers and comments are one token each, `package` and `import` lines, literal-only `List.of`,
  `Map.of` and `Arrays.asList` calls and array initializers are blanked and generated files are left
  out, so a copy with renamed locals and changed literals fails too, with `duplicate-clone` and an
  identity starting `renamed:`. It replaces a plain clone over the same two ranges, and drops clones
  made of declarations only (fields, constructors, getters and setters) and clones that only repeat
  one or two statements (DTO mappers, enum `switch` tables). The copy lives under the report
  directory while the run lasts. The message names the same route as for any clone: add either file
  of the pair to `exclude`.

| Tool                 | Report                      | Ingester                                              | Classification                                                    | Identity                                                                                                                                                              |
| -------------------- | --------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| jscpd (`duplicates`) | jscpd JSON, per source root | `normalizeDuplicates` (TypeScript `duplicates` check) | `duplicate-clone` enforceable; `duplicate-clone-size` descriptive | Sorted file pair, a hash of the cloned text, and the n-th occurrence of that text in the pair; the size metrics use pair, occurrence and metric name. No line number. |

Editing the cloned text changes its hash, so a clone that was changed (not only moved) counts as a
resolved plus a new finding, as in the TypeScript check.
