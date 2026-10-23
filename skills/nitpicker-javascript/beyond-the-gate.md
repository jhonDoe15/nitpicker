# Beyond the gate

The gate can't check these; reviewers keep catching them.

## Changing shared code

- Look for a helper or constant that already does the job under another name before you
  add one.
- Fix a bug where it happens. When one caller of a shared function misbehaves, change that caller,
  not the contract the other callers rely on. If the contract must change, run and extend the
  tests of its existing callers.
- When you move code, switch every caller in the same change.
- A wrapper that forwards a value or callback must not turn `false` or `0` into a default; test
  both.
- Generated files: change the generator or template, then regenerate. Never edit the output.
- Feature flags: one flag per feature, checked in the feature's `adapters/`. When a flag retires,
  delete the flag, its checks and the old path together.

## Tests for a fix

- Reproduce the failure through the path that broke (the missing input, the module boundary),
  not by calling the inner function you changed.
- Test collections with two or more items, a duplicate, and an item whose nested field is
  `undefined`.
- Round-trip values that need escaping: `expect(parse(format(value))).toEqual(value)`.
- Test a duration or limit with the production constant, not a copy of its value.
- Build fixtures from what the real producer returns, including the shapes with absent fields.
- For measured values (sizes, positions, timings), assert relationships (no overlap, order holds),
  not the numbers.
