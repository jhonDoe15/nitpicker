# Class and package size limits

Part of the [Java preset guide](../java-preset.md).

Three limits on classes of the main sources and one on package depth, all failing only when the
change makes them worse (the same ratchet as the file limits): a class already over a limit is
held at its value and fails when it grows, and a new class over a limit fails. Each message names
the allowed form and the `exceptions` entry that lifts it.

| Rule                      | Default limit                                                                            | Threshold          |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------ |
| `class-methods-limit`     | 20 methods per class; getters and setters count, constructors do not                     | `classMethods`     |
| `class-fields-limit`      | 10 instance fields per class; record components count, statics and enum constants do not | `classFields`      |
| `inheritance-depth-limit` | 3 superclasses; a superclass outside the project counts as one level                     | `inheritanceDepth` |
| `folder-depth-limit`      | 4 package levels below the root package (test sources too)                               | `folderDepth`      |

- **Classes.** `languages/java/gradle/StructureMetrics.java` (the Gradle task `nitpickerStructure`,
  and the structure step of the Maven run for each module) writes `classes.json` next to
  `structure.json` in the same parse, so each module's sources are parsed once. Gradle and Maven
  projects get the same limits. Member and
  local classes, interfaces, enums, records and annotation types are measured on their own;
  anonymous classes are not. Tests are not measured: a test class legitimately holds many methods.
  The inheritance chain is resolved from the source text (same package, imports, wildcard imports,
  nested names, names in full), not compiled, so a superclass that only the compiler can find counts
  as one level and ends the chain, so a hierarchy that continues in another module or a library is
  undercounted. A record over `classFields` gets its own message (components, not fields). A kotlin-preset project gets the class limits for its `.java`
  files; Kotlin classes are not measured.
- **Package depth.** The root package is the longest package prefix all main and test code of the
  base shares, so adding a package outside it (`db/migration`, the default package) moves nothing:
  the head run reads the root from the base snapshot, and a project with no base code uses its
  own. A package with code in it that lies more than four levels below the root fails once per
  kind of file (source, test); a package outside the root counts its own levels. Packages are the
  folders under the source roots.
- **A missing report is an error.** If `classes.json` is absent the run fails with a tool error
  naming the structure step (`StructureMetrics.java`), so a build that skipped it cannot silently
  drop the limits.
- **Allowed form.** Split a class by responsibility, group fields into a record, prefer composition
  to a deep hierarchy, and keep packages flat: group by responsibility instead of nesting.
- **Exceptions.** A class limit is lifted for the file the class is in
  (`{ "rule": "class-methods-limit", "paths": ["src/main/java/app/Mapper.java"], "reason": "..." }`);
  `folder-depth-limit` for the package folder (`"paths": ["src/main/java/app/a/b/c/d/e/**"]`).
