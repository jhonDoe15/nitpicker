# Doc comments

Part of the [Java preset guide](../java-preset.md).

Javadoc is allowed on any declaration and required on none (see [Slice 3: Checkstyle](slice-3-checkstyle.md)),
but what it says is checked by the shared `doc-comment-content` rule, the same one the TypeScript
preset runs as `nitpicker/no-comments` and the Python preset runs on docstrings. A doc comment is
reported when its description only restates the declaration's name (`/** Gets the order total. */`
on `getOrderTotal`), unless a tag says more (`@return cents, rounded down`; a tag with only a name or
a type, such as `@param id` or `@throws IOException`, does not, and neither do `@author`, `@since`,
`@version`, `@see` and the `@serial` tags), or when its description is longer
than 5 lines, tags, blank lines and code examples not counted. The word split, the filler words and
the stems are those of the TypeScript rule.

- **Where.** `adapters/doc-comments/` reads the `.java` files of the main source roots in Node, on
  Gradle and Maven alike; test sources are left alone, as in the other presets. Comments and string
  literals (text blocks too) are masked first, so a `/**` inside a string is not a doc comment.
- **What counts.** A `/** ... */` comment (not `/**/`), or a run of `///` Markdown doc comment lines
  (Java 23; a `////` banner is not one), right before a type (`class`, `interface`, `enum`,
  `record`, `@interface`), a method, a constructor (also a compact record constructor), a field or
  an enum constant, after any annotations and modifiers, at the top level or in a type body. A
  comment before a `package` line, a statement, a local declaration or a member of an anonymous
  class is not read.
- **Javadoc markup.** A `<pre>` block counts as a code example, like a Markdown fence, so an
  `@Override` line inside it does not end the description, while prose on the same line before
  `<pre>` or after `</pre>` still counts; other HTML tags (`<p>`, `<b>`,
  `<code>` ...) and entities (`&amp;`) are dropped, and inline tags (`{@code x}`, `{@link Order}`)
  read as their text.
- **Findings.** Tool `facts`, rule `doc-comment-content`, on the comment's first line. The
  identity is `doc-comment:<qualified name>:restating` or `:long`, where the qualified name holds
  the enclosing types and, for a method or constructor, the parameter types with type-use
  annotations dropped
  (`Orders.total(Map<String,Integer>,int...)`), so overloads stay apart and a growing comment keeps
  its identity. A comment that is right as written gets a top-level `exceptions` entry for
  `doc-comment-content`.
