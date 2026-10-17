# Beyond the gate

The gate can't check these; reviewers keep catching them.

## Changing shared code

- Look for a class, helper or constant that already does the job under another name before you
  add one.
- Fix a bug where it happens. When one caller of a shared method misbehaves, change that caller,
  not the contract the other callers rely on. If the contract must change, run and extend the
  tests of its existing callers.
- When you move code, switch every caller in the same change; keep no `@Deprecated` delegate or
  other compatibility path.
- An overload or wrapper that forwards a value must not turn `null`, an empty `Optional` or
  `false` into a default; test both.
- A state with more than two values is an `enum` or a `sealed interface`, not a nullable
  `Boolean` or a pair of flags.
- Generated code (annotation processors, OpenAPI or protobuf output): change the generator, the
  spec or the template, then regenerate. Never edit the output.
- Feature flags: one flag per feature, read in one place. When a flag retires, delete the flag,
  its checks and the old path together.

## Tests for a fix

- Reproduce the failure through the path that broke (the controller, the listener, the module
  boundary), not by calling the inner method you changed.
- Test collections with two or more items, a duplicate, and an element whose nested field is
  `null`.
- Round-trip values that need escaping or mapping:
  `assertThat(mapper.readValue(mapper.writeValueAsString(order), Order.class)).isEqualTo(order)`.
- Test a duration or limit with the production constant (`OrderLimits.MAX_ITEMS`), not a copy of
  its value.
- Build fixtures from what the real producer returns (a recorded response, an entity as the
  repository loads it), including the shapes with absent fields.
- For measured values (sizes, positions, timings), assert relationships (no overlap, order holds),
  not the numbers.
