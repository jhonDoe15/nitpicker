# Patterns translated without escaping

A chain of `replace`, `replaceAll` or `replaceFirst` calls that turns a glob, a regex source or a `LIKE` pattern
into another pattern language, without escaping the target's metacharacters first, is an enforceable
`pmd/PatternTranslation` finding (`languages/java/adapters/review-rules/string-calls/`), in the Java and Kotlin
presets alike. A configured value with a `.` in it then matches any character and widens an allow-list, a `$`
in a table name breaks the generated regex, and a `%` or `_` in the source becomes a `LIKE` wildcard. The rule is
read from the main sources of every module and printed as a PMD rule, so it runs the same on Gradle and Maven
builds. The finding is on the last call of the chain.

- **The chain:** two or more `replace`, `replaceAll` or `replaceFirst` calls with two arguments on one value,
  where a replacement is a regex wildcard string (`.*`, `.+`, `.`, `[^/]*`, `[^/]+`, `([^/]+)`) and the result
  goes to `Pattern.compile`, `Pattern.matches`, `String.matches`, `Regex(...)` or `.toRegex()` (also through a
  local variable used that way), or two replacements are `%` and `_` (a `LIKE` pattern).
- **Allowed forms, not reported:** a root that goes through `Pattern.quote(...)`, `Regex.escape(...)` or any
  call with `escape` or `quote` in its name, a step that escapes (`replace("%", "\\%")`, a replacement with a
  group reference), a root that is constant text, a single `replace`, and a chain whose result never reaches a
  regex. Tokenise the pattern and map each token, or use a glob library, when the translation is richer.
- **Not covered:** test sources and files under `exclude`; a pattern split across methods, a chain built in a
  loop, and a translation written as a character loop.

The message names the value, the target language and the allowed forms, and ends with the exception sentence for
`{ "rule": "pmd/PatternTranslation", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/string-calls/pattern-translation.test.mts`. The Go counterpart is
`go-rules/pattern-translation`; the TypeScript, JavaScript and Python counterparts are listed in their presets.
