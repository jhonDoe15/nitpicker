# Preconditions whose message names another value

A precondition that checks one value while its message names another parameter or local is an enforceable
`pmd/PreconditionMessageNamesOtherValue` finding
(`languages/java/adapters/review-rules/precondition-messages/`), in the Java and Kotlin presets alike. Either the
message is wrong and the failure points the reader at the wrong argument, or the wrong value is checked and the
one the message names goes through unchecked: `Assert.notNull(timeToLive, "TimeUnit must not be null")` never
checks the unit. Merged fixes in open-source projects (batch, messaging, security and data frameworks) corrected
the checked value or the message.

- **Reported:** `Assert.notNull`, `hasText`, `hasLength`, `notEmpty`, `isTrue`, `state`, `Objects.requireNonNull`,
  `Preconditions.checkNotNull`, `checkArgument`, `checkState`, Commons `Validate` and, in Kotlin, `requireNotNull`,
  `checkNotNull`, `require` and `check` (message in the trailing lambda), whose message literal starts with
  `<word> must`, `<word> is`, `<word> cannot` and the like, where `<word>` (also with a lower-case first letter,
  so `TimeUnit` matches `timeUnit`) is a parameter or local of the enclosing method, or a record component in a
  compact constructor, and no identifier of the checked expression is `<word>`.
- **Allowed forms, not reported:** a message that names the checked value (`name must not be null` for `name`,
  `getCount()` for `count`), a message about the type or concept of the checked value (`TimeUnit` for
  `targetTimeUnit`, `MessageListener` for `listener`: the last word matches, or the checked name is the initials),
  an element check (`must not contain`), a first word that is no name in scope or starts with `use`, a message that
  also names the checked value, a checked value derived from the named one (`length = delimiter.length`,
  `key instanceof String constantName` for `key`), and a message built with `+`.
- **Not covered:** fields used inside a method body, conditions that read several values, and swapped
  placeholder labels in format messages.

The message names both values and ends with the exception sentence for
`{ "rule": "pmd/PreconditionMessageNamesOtherValue", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/precondition-messages/precondition-messages.test.mts`. The TypeScript and JavaScript
counterpart is `nitpicker/no-mismatched-precondition-message`.
