# Structure limits

Part of the [Kotlin preset guide](../kotlin-preset.md).

The shared structure rule (`shared/rules/structure.mjs`) runs on Kotlin functions: more than 50 lines,
15 statements or 3 parameters, or control nesting deeper than 2, fails with the rule ids
`function-lines-limit`, `function-statements-limit`, `function-parameters-limit` and
`function-control-nesting-limit` and the messages of the other languages, under the tool name
`structure`. A function that already exceeded a limit on the base and was edited fails only when
that number grew (`{name} grew from 4 to 5 parameters (limit 3)...`); a function that only moved,
or was edited without getting worse, stays baselined. That is the shared "only if worse" ratchet,
keyed by function name and occurrence in the file, with a hash of the function text in the identity.
The exception mechanisms are in `nitpicker.config.json`: an `exceptions` entry for the rule accepts
one function (`{ "rule": "function-lines-limit", "paths": ["src/main/kotlin/app/Big.kt"],
"function": "Big.run", "reason": "..." }`, `function` optional here) or the whole path, and the
message of each finding prints the entry; `exclude` drops every finding under a path (generated code);
`thresholds.crapLimit` changes the CRAP limit; there are no inline disables.

**Metric source (decision).** `languages/java/gradle/kotlin-psi` parses the Kotlin sources
(parse only, no compilation) with the PSI parser of the Kotlin compiler and writes
`kotlin-metrics.json` in the report directory (and `kotlin-facts.json`, see [Review rules](review-rules.md)). It is compiled and run by
the JVM that runs Gradle, with `org.jetbrains.kotlin:kotlin-compiler-embeddable` on the class path. The version is
pinned as `kotlinCompiler` in the init script (2.4.21) and resolved from its own Gradle configuration
(`nitpickerKotlinCompiler`), like the other tools. It uses the compiler's PSI classes, so bumping the
pin means running `npm run test:kotlin` again; the `kotlin-e2e` GitHub Actions workflow runs it for a
push to `main` that changes `languages/java`, `core` or `shared`, the package files or the workflow
itself, by hand, and on a pull request when the `run-ci` label is added. A line-based tool cannot be the source: it has no statement count or control nesting, and
token-based readers misread ordinary Kotlin (extension functions such as `fun String.shout() = ...`,
expression-bodied functions, the `->` of a lambda), which would attribute a complexity per function to
the wrong lines.

**What is measured, all from the one parse, with the definitions of the other languages.**

| Metric              | Definition                                                                                                                                                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lines`             | Last line minus first line plus 1; annotations and modifiers count, KDoc and comments do not.                                                                                                                                                                                                         |
| `statements`        | Every element of a block (declarations, expressions, `return`), plus the unbraced body of an `if`, `else`, loop or `when` branch that is itself a statement, plus 1 for an expression body.                                                                                                           |
| `maxControlNesting` | Deepest nesting of `if`, `for`, `while`, `do`, `when` (like Java's `switch`) and `catch`; a flat `if` / `else if` / `else` chain is one level, whatever its length, while an `if` inside an `else { }` block or inside a branch body nests one deeper. `try` itself and lambdas are not control flow. |
| `parameters`        | Declared value parameters. An extension receiver is not one; a parameter with a default value is.                                                                                                                                                                                                     |
| complexity          | 1 plus each `if`, `for`, `while`, `do`, `when` branch other than `else`, `catch`, `&&`, `\|\|` and `?:`. It is the CRAP input, below.                                                                                                                                                                 |

A unit is a function with a body, a property accessor with a body, a secondary constructor with a
block body, an `init` block with statements, a lambda, an anonymous function or a local function, or
a property whose initializer is a lambda or an anonymous function or a call with a lambda, or whose
delegate takes a lambda (`val handler = { x -> ... }`, `val f = fun(x: Int) { ... }`,
`val v by lazy { ... }`, `val o by Delegates.observable(0) { ... }`, `val m = n.let { ... }`,
`val l = list.map { ... }`), the way an arrow-function constant is a unit in TypeScript; the body is
the lambda's and the unit is named after the property. Any other lambda is a unit named after the
unit that holds it and `<lambda>` (`Class.bump.<lambda>`, `Class.bump.<lambda>.<lambda>` for one
inside it), or, for a local property or local function, after that name (`Class.bump.scale`,
`Class.bump.clamp`). Any other property initializer is a unit when it holds the braces of `if`, `try`
or `when`, or branches (`if`, `when`, `&&`, `?:` and the like) outside its lambdas, and so is a call
with a lambda whose other parts branch; `val x = a + 1` and `val s = "text"` are not. Each `init`
block is a unit named after its class, `Class.<init>` (an empty block is not a unit). A class's
blocks share the name, so a finding on one is numbered only among the blocks of that class with the
same text that are over the same limit: inserting, deleting or reordering other blocks, or adding
an empty `init {}`, never makes a legacy block new. An edited block is held by that rule's ratchet like any function. A message on an
`init` block or a property initializer says to move the nested part into its own function, because
neither can `return` early. To accept such a unit, drop its file with `exclude`, as for any structure
or CRAP finding; the unit name (`Class.<init>`, `Class.property`) is the one that a per-function
exception would name. Lambdas, anonymous functions and local functions, and the members of
nested, local and anonymous classes and objects, are units of their own and do not count towards
the function that contains them: its statements, control nesting and complexity leave them out (as
TypeScript's analyzer does for its callbacks), while `lines` is its physical span, which includes
theirs. A unit inside an `inline` function is `inline` too. Primary constructors and functions without a body (abstract, interface,
`expect`) are not units. Names are `function` (top level), `Class.function`,
`Class.Receiver.function` for an extension, `Class.property.get` for an accessor, `Class.property`
for a property unit, `Class.<init>` for an `init` block, `Class.Class` for a secondary
constructor and `<anonymous>` for an object expression. Script files (`.kts`) are not read. Source directories are the ones Gradle reports
(generated code under the build directory is already left out), so a package named `build`, `out`
or `target` is measured like any other.

**A syntax error is a failure.** The sources have compiled before the metrics step runs, so a parse
error means the pinned compiler (2.4.21) does not know the syntax the project uses. The step fails
with the file, the line and the pinned version instead of reporting wrong numbers; bump
`kotlinCompiler` in the init script. A leading byte order mark is ignored.

## Class limits

`kotlin-psi` also lists every named class, interface, object and companion object with its
member functions, its fields and its superclass (the supertype with a constructor call), and each
file's imports. A class with more than 20 functions (`class-methods-limit`), more than 10 fields
(`class-fields-limit`: constructor `val`/`var` parameters and properties with a backing field; computed,
abstract and `const` properties do not count) or more than 3 superclasses (`inheritance-depth-limit`:
a superclass outside the project counts as one level) fails under the tool `structure`, with the Java
preset's thresholds, messages and ratchet (the shared `classLimitFindings`): a class already over a
limit fails only when it grows, and a `data class` is measured by its components, like a Java record.
Each finding ends with the exception sentence for its rule.
