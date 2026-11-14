# Beyond the gate

The gate can't check these; reviewers keep catching them.

## Changing shared code

- Look for a function, class or constant that already does the job under another name before you
  add one. The duplicate check finds only copies of five lines or more.
- Fix a bug where it happens. When one caller of a shared function misbehaves, change that caller,
  not the contract the other callers rely on. If the contract must change, run and extend the
  tests of its existing callers.
- When you move code, switch every caller in the same change. The gate rejects a module
  `__getattr__` forwarder, `OldName = NewName` and a deprecation warning; an old signature kept
  alive by a wrapper is not checked.
- A wrapper or default that forwards a value must not turn `None`, `0`, `""`, `[]` or `False` into
  a default: test both. The gate catches `value or DEFAULT` on a parameter that can be falsy.
- A state with more than two values is an `enum.StrEnum` or a union of frozen dataclasses (the gate
  rejects `bool | None`, not a pair of flags). Map its members with a dict keyed by the enum and
  `parametrize` a test over `list(Status)`, so a new member fails a test. A `match` over an enum
  fails the coverage check on its last `case`.
- Generated code (protobuf, OpenAPI or `datamodel-codegen` output): change the generator, the spec
  or the template, then regenerate. Never edit the output.
- Feature flags: one flag per feature. When a flag retires, delete the flag, its checks and the old
  path together.

## Tests for a fix

- Reproduce the failure through the path that broke (the CLI runner, the web test client, the
  adapter's parse function), not by calling the inner function you changed.
- Test collections with two or more items, a duplicate, and an item whose nested field is `None`.
- In a round-trip test, use text with quotes, commas, newlines and non-ASCII. Round-trip a pydantic
  model too, which the gate does not check: `Order.model_validate_json(order.model_dump_json()) == order`.
- Build fixtures from what the real producer returns (a recorded response saved under
  `tests/fixtures/`, a row as the repository loads it), including the shapes with absent fields.
- For measured values (sizes, positions, timings), assert relationships (no overlap, order holds),
  not the numbers.
