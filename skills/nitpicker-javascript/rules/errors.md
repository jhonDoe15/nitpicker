# Errors

Part of the [nitpicker-javascript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- `domain/` returns expected failures as discriminated unions (`{ kind: 'empty-name' }`), never
  throws them. Success is a `kind` member too: never `T | Failure` narrowed with `typeof`, never
  `Failure | undefined`.
- A `catch` returns a failure result (carrying the caught error only if something reads it) or
  rethrows an `Error` subclass with `{ cause: error }`, which a test asserts. Keep the `try` around
  the call that throws:
  `try { return schema.safeParse(JSON.parse(text)); } catch { return { kind: 'malformed-json' }; }`.
- With no caught error, throw `new XError(message)` without `cause`.
- Handle malformed input only as the ticket says; don't silently drop entries.
