# Sources and decisions

Why `--fix` rewrites what it rewrites in Kotlin. The recipes live in
`languages/java/fix/recipes/kotlin/` and run on Gradle and Maven projects alike, before the
formatter. They work on the Kotlin source text: they do not ask the PSI facts tool for edits, so
they need no rebuild of that JVM tool. A recipe flags only what its rule flags, and where the
rewrite is not provably correct from the text alone it leaves the code as it is. A recipe that
rewrites the code around a comment (precondition guards, modifier order, explicit `it`, optional
`abstract` and the empty class blocks) leaves the code as it is when a comment sits inside the
text it would replace.

A `review` recipe runs only when its rule is selected on purpose; a plain `--fix` runs the `safe`
ones.

## Fixed

| Rule                                          | Recipe                                      | Safety | What it does                                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detekt.style.UseRequire`                     | `kotlin-use-require`                        | safe   | `if (c) throw IllegalArgumentException("m")` becomes `require(!c) { "m" }`; a leading `!` or a top-level `==`/`!=` is flipped, anything else is wrapped in `!( )`                             |
| `detekt.style.UseCheckOrError`                | `kotlin-use-check-or-error`                 | safe   | the same for `IllegalStateException` with `check`; a bare `throw IllegalStateException("m")` becomes `error("m")`                                                                             |
| `detekt.style.UseRequireNotNull`              | `kotlin-use-require-not-null`               | safe   | `require(x != null)` becomes `requireNotNull(x)`, message kept                                                                                                                                |
| `detekt.style.UseCheckNotNull`                | `kotlin-use-check-not-null`                 | safe   | `check(x != null)` becomes `checkNotNull(x)`                                                                                                                                                  |
| `detekt.style.MayBeConst`                     | `kotlin-may-be-const`                       | safe   | adds `const` to a `private val` with a plain literal in an object, a companion object or a file                                                                                               |
| `detekt.style.MayBeConst`                     | `kotlin-may-be-const-visible`               | review | the same for a `val` that is not private; review because Java callers lose the getter                                                                                                         |
| `detekt.style.ModifierOrder`                  | `kotlin-modifier-order`                     | safe   | sorts the modifiers of a declaration into the Kotlin convention order                                                                                                                         |
| `detekt.style.OptionalAbstractKeyword`        | `kotlin-optional-abstract-keyword`          | safe   | drops `abstract` from interfaces and their members                                                                                                                                            |
| `detekt.style.ExplicitItLambdaParameter`      | `kotlin-explicit-it-lambda-parameter`       | safe   | drops `it ->` from a lambda                                                                                                                                                                   |
| `detekt.style.UnnecessaryLet`                 | `kotlin-unnecessary-let`                    | safe   | `x.let { it.foo() }` becomes `x.foo()`, `x?.let { it.foo() }` becomes `x?.foo()`, `x.let { f(it) }` becomes `f(x)`                                                                            |
| `detekt.style.VarCouldBeVal`                  | `kotlin-var-could-be-val`                   | safe   | a local `var` that is never reassigned, in the function it lives in, becomes `val`; properties of classes and objects are left alone, also when the class header holds braces                 |
| `detekt.empty-blocks.EmptyClassBlock`         | `kotlin-empty-blocks`                       | safe   | `class A {}` becomes `class A`; a class without a body is never joined with the braces of the next declaration                                                                                |
| `detekt.empty-blocks.EmptyFinallyBlock`       | `kotlin-empty-blocks`                       | safe   | drops an empty `finally` after a `catch`                                                                                                                                                      |
| `detekt.empty-blocks.EmptyInitBlock`          | `kotlin-empty-blocks`                       | safe   | drops an empty `init` block                                                                                                                                                                   |
| `detekt.empty-blocks.EmptyDefaultConstructor` | `kotlin-empty-blocks`                       | safe   | `class A()` becomes `class A` when no secondary constructor needs it                                                                                                                          |
| `detekt.style.UseIsNullOrEmpty`               | `kotlin-use-is-null-or-empty`               | review | `x == null \|\| x.isEmpty()` becomes `x.isNullOrEmpty()`; review because the type of `x` is not known                                                                                         |
| `detekt.style.UseOrEmpty`                     | `kotlin-use-or-empty`                       | review | `x ?: emptyList()` (also set and map forms) becomes `x.orEmpty()`; review for the same reason                                                                                                 |
| `detekt.style.UnusedPrivateProperty`          | `kotlin-unused-private-members`             | review | removes a one-line private property whose name appears nowhere else in the file; review because the initializer may have a side effect                                                        |
| `detekt.style.UnusedPrivateMember`            | `kotlin-unused-private-members`             | review | removes a private function with a block body whose name appears nowhere else in the file                                                                                                      |
| `detekt.style.NewLineAtEndOfFile`             | `kotlin-final-newline`                      | safe   | ends the file with a line break                                                                                                                                                               |
| `catch-log-without-exception`                 | `kotlin-catch-log-without-exception`        | safe   | passes the caught exception to the logger: `log.error("m", e)`, or `logger.error(e) { "m" }` for a lambda logger                                                                              |
| `kotlin-source/LogStringConcatenation`        | `kotlin-log-string-concatenation`           | review | turns a message built with `+` or a template into `{}` placeholders on an SLF4J or Log4j 2 logger; review because an operand can be a throwable, which the logger then prints as an exception |
| `kotlin-source/CommentedOutCode`              | `kotlin-commented-out-code`                 | safe   | deletes the commented-out code                                                                                                                                                                |
| `kotlin-source/GeneratedOnHandWrittenCode`    | `kotlin-generated-on-hand-written-code`     | safe   | removes the annotation                                                                                                                                                                        |
| `kotlin-source/JvmSyntheticOnHandWrittenCode` | `kotlin-jvm-synthetic-on-hand-written-code` | review | removes `@JvmSynthetic`; review because Java callers see the function afterwards                                                                                                              |
| `kotlin-source/MutationIgnoreMarker`          | `kotlin-mutation-ignore-marker`             | review | removes `@DoNotMutate` and `@CoverageIgnore`; the mutants still need a test                                                                                                                   |
| `pmd/FocusedTest`                             | `kotlin-focused-test`                       | safe   | drops the focus from the outermost focused Kotest registration or name                                                                                                                        |
| `pmd/ValidationAnnotationTarget`              | `kotlin-validation-annotation-target`       | safe   | writes `@field:` on a Bean Validation annotation of a constructor property, for annotations imported by name                                                                                  |

## Declined, and why

- `detekt.style.WildcardImport`: the names the wildcard provides are not known from the source, and
  the project may follow a wildcard style on purpose (the `conventions` setting). Expanding it needs
  symbol resolution.
- `detekt.style.UnnecessaryApply` and `UseLet`: the rewrite changes the value of the expression
  unless its result is unused, which the text does not show.
- `detekt.empty-blocks.EmptyElseBlock`, `EmptyIfBlock`, `EmptyForBlock`, `EmptyWhileBlock`,
  `EmptyTryBlock`: removing the block changes the value of an `if` used as an expression, or drops
  side effects of the condition. `EmptyCatchBlock` and `EmptyFunctionBlock` have no single rewrite.
- `detekt.style.UnusedPrivateClass`, unused constructor properties and `private var` properties:
  they can be set by a framework or read by reflection.
- `kotlin-source/DetachedTestCase`: the fix is either `@Test` (which needs the right framework
  import) or `private`, and the code does not say which one the author meant.
- `kotlin-source/HttpWithoutTimeout` and `ShellCommand` (review): the timeout value and the
  argument list are decisions, not rewrites.
- `kotlinc/USELESS_CAST` and `DEPRECATION` with `ReplaceWith`: they need the compiler's position and
  type facts. The recipes see only the text, so a Kotlin text edit would have to guess the cast or
  inline the replacement. They wait for findings to reach the fixer.
- The Kotlin column of `unused-option`: it comes from the PSI facts tool with resolved callers, so a
  text edit cannot prove that no caller passes the option.
- `detekt.style.UseRequire` and `UseCheckOrError` with a message that is not a string literal, a
  cause, or a custom exception class: `error()` and the lambda form change what a `null` message
  does.

## Fix plans for near-duplicates

`structure/near-duplicate` has no recipe that rewrites a pair of copies across files, so a run writes a
fix plan of kind `extract-shared-function` for each new finding (`fix-plans.json`, see `docs/usage.md`).
It gives the signature of the function to extract (the parameters of the first copy, then one
parameter for each value that differs), the arguments each copy passes, the nearest shared folder
that the layout allows (`layout.sharedRoots`, else a `shared` folder), or the nearest common folder when both files are in one feature and why no recipe made the change. The plan is the Java one over the Kotlin trees. Kotlin has no extraction recipe, and the plan says so for a pair in one file. The names it picks avoid every name in the two copies.

## Not run here

The Gradle and Maven Kotlin end-to-end samples were not run in this environment. The recipes have
unit tests, and `languages/java/fix/recipes/jvm-recipes.test.mjs` runs the fix on a Gradle and a
Maven Kotlin project with a stubbed formatter.

## Near-duplicate extraction

No recipe extracts the shared function of a `near-duplicate` pair in Kotlin. The extraction needs the
parameter and return types of the new function, and the Kotlin recipes see only text. The finding
keeps its fix plan.

The same holds for a `partial-run` pair: no recipe extracts the shared statements in Kotlin, and the finding keeps its fix plan.
