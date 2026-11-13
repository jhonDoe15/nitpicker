# Reuse rules

Part of the [Java preset guide](../java-preset.md).

`duplicate-definition`, `sibling-copy-edit`, `exported-name-collision` and `near-duplicate` are the
shared rules of the TypeScript preset (see `typescript-strict-preset.md`), written once over neutral facts
(`shared/rules/facts/`). The Java and Kotlin presets produce those facts from source, on Gradle and
Maven alike, in the project-wide step (`builds/project-wide.mjs`), so they need no build output.
The findings have tool `structure` and are lifted with the top-level `exceptions`.

- **Producer.** `adapters/reuse/jvm-reuse-facts.mjs` reads every `.java` file (and `.kt` file with
  `preset: "kotlin"`) under the main source roots the build reports for each module, leaving out
  roots under `build/` and files matched by `exclude`. One tokenizer
  (`adapters/reuse/source/jvm-tokens.mjs`) serves both languages: each string, text block, raw string
  or character literal is one token, comments are dropped, Kotlin block comments nest and Kotlin
  string templates are read for the names they use. A source file is a module and a Gradle or Maven
  module is a package, so copies are compared within one build module.
- **Definitions.** Top-level types (Java `class` and `record` as `class`, `interface`, `enum`,
  `@interface` as `type`; Kotlin classes and `object`s as `class`, `interface`, `enum class`,
  `annotation class` and `typealias` as `type`), and the members that need no instance: Java
  `static` methods and `static final` fields (every interface field), Kotlin top-level `fun`, `val`
  and `const val`, and the functions and `val`s of a top-level `object` or of a class's `companion
object`. Instance methods are left to the duplicates check, as class methods are in the
  TypeScript preset. A member is named `Owner.name` (`Money.of`), with its parameter types when it
  is overloaded (`Money.of(long)`), so two classes' copies of a helper stay apart in findings;
  copies are grouped by the plain name. Everything but `private` counts as exported, since
  package-private Java code is usable from the package. A `main` function, and a type that holds
  one, is an entry, which `sibling-copy-edit` skips.
- **Uses.** A name in a file resolves the way javac and kotlinc resolve it: an explicit import
  first, then a type (or Kotlin top-level declaration) of the same package, then a star import; a
  fully qualified name (`shop.billing.Money`) resolves directly. `Type.member` and `Type::member`
  uses a static member, a Kotlin extension call (`order.toDto()`) uses the imported or same-package
  function, and a static or `object` import (`import static shop.util.Strings.trim;`) uses that
  member. These uses decide whether a definition is used (an unused one is the dead-code checks'
  business), and the free names of each definition, resolved this way, are part of its identity,
  so two copies that use different library types (`java.util.Date` and `java.sql.Date`) are not
  duplicates. A name of the copy's own file other than a literal constant (a helper, a mutable
  field, a nested type) is its own, so two `capped()` copies that call their class's `limit()`
  are not duplicates either; the helper is reported, if it is a copy. A static member that reads an
  upper-case name the file does not declare (an inherited constant) also takes its class's
  supertypes into its identity. Kotlin `expect` and `actual` declarations and `override` members
  are left out.
- **`exported-name-collision`.** In Java a file cannot import two classes of one simple name, so the
  collision is a class imported (or of the same package) while another class of that name is
  written fully qualified; in Kotlin it is that too, or an `import ... as` alias, as in TypeScript. The Java
  message tells to rename one or to use both by their fully qualified names. Functions are left out
  in both languages: two same-named functions imported into one file are overloads, and extension
  functions of one name on different receivers are idiomatic Kotlin.
- **`sibling-copy-edit`.** On the head run of a change the runner reads each changed file of the
  base checkout (`--baseline-root`) again, following renames from `--baseline-moves-file`, and
  compares the edited definition with its base copy and its same-named siblings in the module.
- **`near-duplicate`.** Java only for now. `adapters/near-duplicates/java-trees.mjs` parses the
  same `.java` files with tree-sitter (`web-tree-sitter` and the vendored `tree-sitter-java`
  grammar, in a child process) into one tree per method, constructor and field lambda, and the
  shared engine (`shared/near-duplicates/`) proves which pairs are copies. Each pair is reported
  once, at the copy whose `file#name` sorts last, and keeps its identity while both copies stay, so
  a pair the base already had is never new.
- **`shared-used-by-one-feature`.** The same facts feed the feature rule: a source file under a
  folder that `layout.sharedRoots` matches (default `**/shared`, such as
  `src/main/java/com/acme/shared`) that only the files of one feature use, directly or through
  other shared files, is reported with tool `coupling`. Each folder directly under a
  `layout.featureRoots` folder (default `**/features`) is one feature, and a use from any other
  file keeps the shared file where it is. Uses are the ones above, so a class of the same package,
  a fully qualified name and a static import count; only the main sources are read, so tests never
  count. Without a feature folder the rule finds nothing; `"featureRoots": []` turns it off.
