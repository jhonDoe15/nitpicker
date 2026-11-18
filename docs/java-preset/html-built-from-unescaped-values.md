# HTML built from unescaped values

An HTML string that is concatenated, templated or formatted with a value that is not escaped is an enforceable
`pmd/UnescapedHtmlValue` finding (`languages/java/adapters/review-rules/string-calls/html/`), in the Java and Kotlin
presets alike. A `<`, `&` or quote in a name, a title or a message then breaks the markup or injects a tag into a
page, an email or a rendered report. The rule is read from the main sources of every module and printed as a PMD
rule, so it runs the same on Gradle and Maven builds. The finding is on the markup string.

- **The string:** a string literal that holds an HTML tag (`<div`, `</a>`, `<td>`) and is joined with `+`, holds a
  Kotlin `${value}` or `$value`, or is the format of `String.format`, `formatted` or Kotlin `"...".format(...)` with
  a `%s`.
- **Allowed forms, not reported:** a value that is a literal, a number, a `length`, `size` or `count`, or the result
  of a call with `escape`, `encode`, `sanitize`, `html`, `quote` or `clean` in its name (`HtmlUtils.htmlEscape`,
  `StringEscapeUtils.escapeHtml4`, `Encode.forHtml`), a name that says it is already markup, and a `%d` or `%f`
  format verb, and a name declared in the same file with a numeric or boolean type. Text inside `new ...Exception(...)`,
  a logger call (`log.warn`) or `Assert` is a message and is not reported, and neither is a component tag such as
  `<Link`. Building the page with a template engine that escapes (Thymeleaf, `kotlinx.html`) never matches.
- **Not covered:** test sources and files under `exclude`; markup built across several statements (`StringBuilder`
  appends) and a value escaped in another method.

The message names the value and the allowed forms, and ends with the exception sentence for
`{ "rule": "pmd/UnescapedHtmlValue", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/string-calls/html/markup.test.mts`. The Go counterpart is `go-rules/unescaped-html-value`; the
TypeScript, JavaScript and Python counterparts are listed in their presets.
