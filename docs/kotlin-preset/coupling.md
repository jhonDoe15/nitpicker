# Coupling

Part of the [Kotlin preset guide](../kotlin-preset.md).

The stability-direction rule runs on Kotlin. `nitpickerJdeps` runs the JDK's `jdeps` over every main
class directory (the Java and the Kotlin one, so references in both directions between the languages
count) and the Nitpicker side builds the package graph as for Java (see the
[Java preset](../java-preset/coupling-and-stability-ticket-sh6.md)): a package depending on a less stable
package fails with `stability-direction`, with the report-only coupling metrics beside it.

**Module and package (decisions).** A module is a source file, as in Java and TypeScript. The Kotlin
metrics step lists the JVM class names of each file: its top-level classes, objects and interfaces and
the file facade (`FooKt`, or the `@file:JvmName` name) when the file has top-level functions or properties.
Nested classes, companions, lambdas and `WhenMappings` fold into their outermost class by the `$` in
the name, and classes of one file are merged into one module, so the metrics count files and not the
classes Kotlin generates. The package is the one in the bytecode, that is the `package` statement of
the file and not its directory. Of a `@JvmMultifileClass` facade, each file lists its own part
(`Facade__FileKt`) and the first file (in path order) lists the facade class, so callers of the
facade belong to that file. A class that no file lists is its own module.
