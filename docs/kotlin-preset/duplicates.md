# Duplicates

Part of the [Kotlin preset guide](../kotlin-preset.md).

The shared duplicates rule runs on Kotlin: jscpd (the version of the TypeScript preset, mode `mild`)
with `--format kotlin` over each Kotlin source root from the manifest, ignoring the folders named `build`, `generated`,
`target` and `out` (replaced by `duplicates.skippedFolders`). Clones made only of `package` and `import` lines are not reported. Its message names both files and tells to add either to `exclude`; a glob that matches either file of the pair lifts the finding. Any new clone fails with `duplicate-clone`, tool `duplicates`, identity from the file pair,
the cloned text and the n-th occurrence of that text in the pair, never a line. Clones are found within one source root and
within the Kotlin files; a clone between a `.kt` and a `.java` file, or between two source roots, is not
(the same as for several Java roots).

A second jscpd run (100 tokens, 5 lines) goes over a normalized copy of the `.kt` and `.kts` files,
where names, strings, numbers and comments are one token each, `package` and `import` lines and
literal-only `listOf`, `mapOf` and `Pair` calls are blanked and generated files are left out, so a
copy with renamed locals and changed literals fails too, with `duplicate-clone` and an identity
starting `renamed:`. It replaces a plain clone over the same two ranges, and drops clones made of
declarations only (data class fields, also with defaults that call a function, enum constants) and
clones that only repeat one or two statements (DTO mappers, `when` tables, `if` ladders). PMD CPD would not do this better: the
`pmd-kotlin` lexer ignores the identifier and literal flags. The message names the same route as for
any clone: add either file of the pair to `exclude`.

`near-duplicate` (tool `structure`) runs on Kotlin and Java sources together: two functions,
accessors, secondary constructors or property lambdas whose syntax trees are proved copies (the
same apart from renamed locals, up to 4 changed values or types, a shared run of 3 or more
statements, or the same logic written another way: a loop and the `any`/`all` call that replaces
it, a call to a non-`open` helper in the same file and that helper's body, or guards and locals a
solver proves equal) fail, also across modules. A copy large enough for the renamed `duplicate-clone` pass
and different only in names and literals is left to it; type-specialized families and the
platform variants of one Kotlin Multiplatform declaration are not reported (see "Reuse rules" in
`java-preset.md`). Lift a pair with an `exceptions` entry for either file.

The reuse rules `duplicate-definition`, `sibling-copy-edit` and `exported-name-collision` run on
Kotlin and Java sources together, the way the Java preset runs them (see "Reuse rules" in
`java-preset.md`): top-level functions and properties, the members of `object`s and companion
objects, and top-level classes are compared within one Gradle module; an `import ... as` alias or a
fully qualified name that keeps two different classes of one name apart is a collision, and same-named functions, which
overload, are not. `shared-used-by-one-feature` reads the same uses: a file under `layout.sharedRoots` that only one
feature under `layout.featureRoots` uses is reported, as in the Java preset. `public-alternative-bypass` treats a public
`typealias` of a class in a subpackage as a re-export: when `shop/billing/Aliases.kt` declares
`typealias Invoice = shop.billing.internal.Invoice`, Kotlin code outside the folder `shop/billing/` that names
`shop.billing.internal.Invoice` is reported and told to import `Invoice` from `shop.billing`. Java code is left alone,
since Java cannot see a type alias, and so are classes with a `main` function, `private` and `internal` aliases, an
alias of a class in its own package, and aliases of a generic or function type.
