# Replacement strings that expand

A replacement string that is built at run time and given to `String.replaceAll`, `String.replaceFirst`,
`Matcher.replaceAll` or Kotlin `Regex.replace` is an enforceable `pmd/ExpandingReplacement` finding
(`languages/java/adapters/review-rules/string-calls/`), in the Java and Kotlin presets alike. The replacement
reads `$1`, `${name}` and `\`, so a `$` or `\` in a namespace, a tenant id or a table name is expanded or throws
`IllegalArgumentException` instead of being inserted. The rule is read from the main sources of every module and
printed as a PMD rule, so it runs the same on Gradle and Maven builds. The finding is on the call.

- **The call:** Java `x.replaceAll(regex, repl)` and `x.replaceFirst(regex, repl)`, and `matcher.replaceAll(repl)`
  on a receiver named like a matcher or returned by `.matcher(...)`; Kotlin `x.replace(Regex(...), repl)`,
  `x.replaceFirst(Regex(...), repl)` and `regex.replace(x, repl)` on a name declared as a `Regex`, where `repl` is
  not a string literal or a concatenation of literals or a constant name.
- **Allowed forms, not reported:** `Matcher.quoteReplacement(value)` or any call with `quote` or `escape` in its
  name (`Regex.escapeReplacement`), a lambda or method reference (`Matcher.replaceAll(Function)`, Kotlin
  `regex.replace(text) { value }`), a literal or constant replacement (`"$1b"` is meant), and
  `String.replace(CharSequence, CharSequence)` and Kotlin `replace(String, String)`, which are literal.
  An enum's `name()` (and its `value()` or `getValue()` when the file declares an enum) is not reported, and neither is a
  `String.format`, `formatted` or Kotlin template whose values are all numbers or booleans declared in the file.
- **Not covered:** test sources and files under `exclude`; a receiver whose type is not visible in the file (the
  scan matches by token, not by type), and a replacement string built in another method.

The message names the value and the allowed forms, and ends with the exception sentence for
`{ "rule": "pmd/ExpandingReplacement", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/string-calls/replacements/replacements.test.mts`. The Go counterpart is
`go-rules/expanding-replacement`; the TypeScript, JavaScript and Python counterparts are listed in their
presets.
