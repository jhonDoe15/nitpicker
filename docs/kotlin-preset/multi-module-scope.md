# Multi-module builds: affected modules and a project in a module

Part of the [Kotlin preset guide](../kotlin-preset.md).

A Gradle multi-project build or a Maven reactor is not always gated whole. Two layouts narrow a
run to the modules that matter; the [Java preset](../java-preset/multi-module-scope.md) follows
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
- **Cache.** In a multi-module build the cached base entry is also keyed by every file the change
  touches in the repository, since the affected set decides what the base run covers.
- **Not followed.** On Gradle only `project(...)` dependencies link modules. A module that reads
  another one through `files(project(':x').…)`, `evaluationDependsOn`, a task dependency, or an
  included build is not seen as its dependent, so a change in `x` does not select it. On Maven,
  modules that are only built as dependencies (`-am`) still run their tests, as said above. A
  build that relies on such links needs `--all`.

A module outside the project folder (see below) is never reported.

## A project folder that is one module

Putting `nitpicker.config.json` in a module and running nitpicker there gates only that module.

- **Gradle.** The analyzer runs from the module folder. Gradle finds the root `settings.gradle(.kts)`
  above it and builds only that module and the modules it depends on; findings are relative to
  the module folder.
- **Maven.** When the project folder's `pom.xml` is listed as a module by a parent `pom.xml`, directly
  or through nested aggregators up to the repository top (the folder with `.git`), Maven runs from
  the top aggregator with `-pl <module path> -am` on the base and on head, so a sibling the
  module depends on comes from the reactor instead of the local repository. Findings, tests,
  JaCoCo and PIT cover the module (and the modules below it, when it is an aggregator itself); the
  modules `-am` adds are dependencies only. Paths stay relative to the project folder, as on
  Gradle. A pom that no parent lists runs as a standalone project, as before; so does a pom that only one
  of the two snapshots lists, on both snapshots, so the base never fails because the parent pom
  did not list the module yet. The Maven wrapper
  and `.mvn/` are the ones of the top aggregator.

Changes outside the project folder (a sibling module, the parent pom) are not part of the diff of
that project.
