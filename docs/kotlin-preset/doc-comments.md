# Doc comments

Part of the [Kotlin preset guide](../kotlin-preset.md).

KDoc is checked by the shared `doc-comment-content` rule, as Javadoc is in the Java preset (see
[Doc comments](../java-preset/doc-comments.md)): a KDoc comment whose description only restates the
declaration's name, unless a block tag says more (`@param id the account`; `@param id` alone does
not), or whose description is longer than 5 lines, tags, blank lines and fenced code not counted,
is reported with the tool `facts` and an exception for `doc-comment-content`. The scan
(`languages/java/adapters/doc-comments/`) reads the `.kt` and `.java` files of the main source
roots with comments (nested ones too) and string literals masked, and takes the comment right
before a class, interface, object, companion object, `fun interface`, typealias, function,
secondary constructor, property (also a `val`/`var` of a primary constructor) or enum entry, after
annotations (`@get:JsonProperty(...)`) and modifiers. A file comment, a statement, a local
declaration, an `init` block and a member of an anonymous object are not read. The identity holds
the enclosing types and, for a function or constructor, the parameter types
and for an extension its receiver (`Orders.List<R>.sum(Map<String,Int>,(Int)->Unit)`), so
overloads stay apart. `@param[name]`, KDoc's bracketed form, is a tag like `@param name`.
