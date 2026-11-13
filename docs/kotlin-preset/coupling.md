# Coupling

Part of the [Kotlin preset guide](../kotlin-preset.md).

The stability-direction rule runs on Kotlin. `nitpickerJdeps` runs the JDK's `jdeps` over every main
class directory (the Java and the Kotlin one, so references in both directions between the languages
count) and the Nitpicker side builds the package graph as for Java (see the
[Java preset](../java-preset/coupling-and-stability-ticket-sh6.md)): a package depending on a less stable
package fails with `stability-direction`, with the report-only coupling metrics beside it. A
feature package is one unit, as in Java: adapters that implement interfaces declared in the
feature's top package, and a top package that builds its adapters, are not an inversion (see
[Stability direction](../usage.md#stability-direction)). Packages in a dependency cycle fail with
`package-cycle`, one finding per package, from the same graph (see the Java preset's Guards
section).

**Module and package (decisions).** A module is a source file, as in Java and TypeScript. The Kotlin
metrics step lists the JVM class names of each file: its top-level classes, objects and interfaces and
the file facade (`FooKt`, or the `@file:JvmName` name) when the file has top-level functions or properties.
Nested classes, companions, lambdas and `WhenMappings` fold into their outermost class by the `$` in
the name, and classes of one file are merged into one module, so the metrics count files and not the
classes Kotlin generates. The package is the one in the bytecode, that is the `package` statement of
the file and not its directory. Of a `@JvmMultifileClass` facade, each file lists its own part
(`Facade__FileKt`) and the first file (in path order) lists the facade class, so callers of the
facade belong to that file. A class that no file lists is its own module.

## Feature packages and domain boundaries

`feature-internal-import`, `shared-imports-feature`, `feature-cycle` and
`foreign-feature-persistence` run as for Java, over the same jdeps graph, and `shared-used-by-one-feature`
over the same source facts (see [Feature packages](../java-preset/feature-packages.md)): the
public face of a feature is the classes and file facades directly in its package, a feature split
over `src/main/java` and `src/main/kotlin` is one feature, and a Java class calling a top-level
Kotlin function of another feature is an edge to that function's file. Kotlin's `internal` is
visible in the whole module, so it is not feature-private; what counts is the package.

- **Persistence.** `foreign-feature-persistence` knows the Kotlin forms too: an Exposed `Table`,
  `IdTable` (`IntIdTable`, `LongIdTable`, `UUIDTable`) or DAO `Entity` subclass is an entity, and a
  repository declared as `interface PaymentRepository : CrudRepository<Payment, Long>` is a
  repository even when it shares its file with the entity; the file is the unit.
