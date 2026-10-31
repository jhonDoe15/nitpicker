# Beyond the gate

The gate can't check these; reviewers keep catching them.

## Changing shared code

- Look for a function, type or constant that already does the job under another name before you
  add one, in the package and in the module's `internal/` packages.
- Fix a bug where it happens. When one caller of a shared function misbehaves, change that caller,
  not the contract the other callers rely on. If the contract must change, run and extend the
  tests of its existing callers.
- When you move or rename an exported identifier, switch every caller in the same change; keep no
  deprecated alias or wrapper. In a library other modules import, ask before you change an
  exported API.
- A wrapper that forwards a value must not turn a `nil` slice, an empty map, a zero value or
  `false` into a default; test both.
- A state with more than two values is a named type with constants (`type Status int` and an
  `iota` block) and a `switch` that lists every value, not a pair of `bool`s or a `*bool` where
  `nil` means "not loaded yet".
- Generated code (`go generate`, protobuf, mocks, sqlc): change the generator, the spec or the
  template, then regenerate and commit the output with the change. Never edit the output.
- Feature flags: one flag per feature, read in one place. When a flag retires, delete the flag,
  its checks and the old path together.
- Dependencies: add a module only when the standard library does not cover the job, and run
  `go mod tidy` so `go.mod` and `go.sum` list exactly what the code imports.

## Concurrency

- Every goroutine you start has an owner that waits for it (`sync.WaitGroup`, `errgroup.Group`) or
  a `context.Context` that stops it. A goroutine that can block forever on a channel is a leak.
- The sender closes a channel, once; a receiver never does.
- Shared state is guarded by one mutex kept next to the fields it guards, or owned by one
  goroutine that others talk to over channels. Never both.

## Tests for a fix

- Reproduce the failure through the path that broke (the handler, the exported function, the
  package boundary), not by calling the inner function you changed.
- Test slices with two or more items, a duplicate, and an element whose nested pointer is `nil`.
- Round-trip values that need escaping or mapping: marshal, unmarshal and compare with the
  original (`reflect.DeepEqual` or `cmp.Diff`).
- Test a duration or limit with the production constant (`orders.MaxItems`), not a copy of its
  value.
- Build fixtures from what the real producer returns (a recorded response under `testdata/`, a
  row as the database returns it), including the shapes with absent fields.
- For measured values (sizes, positions, timings), assert relationships (no overlap, order holds),
  not the numbers.
