# Multi-module builds: affected modules

Part of the [Kotlin preset guide](../kotlin-preset.md).

A Gradle multi-project build or a Maven reactor is not gated whole in a comparison. The run narrows
to the modules that matter; the [Java preset](../java-preset/multi-module-scope.md) follows
the same rules.

## A comparison gates the affected modules

In a comparison (`--base`, the default `nitpicker` run), a change in a few modules costs those
modules and the modules that depend on them, not the whole build:

- **Affected modules.** A module is affected when a changed file lies inside its folder (any file:
  sources, tests, resources, its own build file or `pom.xml`) or when it depends on an affected
  module, directly or through another one. On Gradle the dependencies are the build's own
  `project(...)` dependencies in any configuration; on Maven they are the reactor modules a module
  names as parent, dependency or plugin (`-pl <affected> -am`, so the modules an affected one needs
  are built as dependencies).
- **What runs.** Tests, JaCoCo, PIT, ArchUnit, Error Prone, PMD, SpotBugs, Checkstyle, the format
  check, structure metrics and the test runtime run on the affected modules only, on the base and
  on head with the same set. The build still compiles the modules the affected ones depend on.
  File limits, coupling and cycles are evaluated over the modules that ran. Maven runs the tests of
  a module that is only built as a dependency (`-am`) because one Maven command cannot skip tests
  for one module, but reports nothing for it.
- **The report.** The unaffected modules cannot gain findings from the change, so the head run
  prints one descriptive finding, `modules not affected: core, tools`, with the module folders.
- **Gate everything.** When the affected set cannot be computed safely, the whole build runs as
  before. That is the case when a changed file belongs to no module (a root build file, `pom.xml`,
  `settings.gradle`, `gradle.properties`, `buildSrc`, `.editorconfig`, `nitpicker.config.json`, a
  shared config folder, any file at the root outside `src/`), when no file changed under the
  project, and when the comparison cannot be read. `nitpicker --all` always gates every module.
- **Cache.** In a multi-module build the cached base entry is also keyed by the list of changed
  files, since the affected set decides what the base run covers.
