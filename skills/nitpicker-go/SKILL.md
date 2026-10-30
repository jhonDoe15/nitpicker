---
name: nitpicker-go
description: Use before writing or changing Go code in a project that runs nitpicker with the go preset, so the code follows nitpicker's one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for Go

nitpicker allows one way to write each construct. Write it that way from the start; the gate is a
backstop. It fails only on findings your change adds, so leave code the task doesn't need alone.

## Finish with the gate

1. Run the project's tests: `go test ./...` (with the build tags the project's
   `nitpicker.config.json` lists under `go.buildTags`, as `-tags=...`). Failing tests are a tool
   error that names them.
2. Format every file you touched with the formatter printed in the finding (gofmt, gofumpt or
   goimports: the gate uses the one the project already uses, so never switch it). With no other
   signal it is `gofmt -w`.
3. When the change is complete, run `npx nitpicker` as a background command you wait on, without a
   pipe: you need its exit code. It runs `go vet`, `go test` and its own checks on the merge base
   and on head with the Go toolchain on the `PATH`. It takes minutes and prints a progress line for
   each slow analyzer.
4. Act on the exit code:
   - 0: done.
   - 1: fix every new finding and any tool error listed below them, then rerun.
   - 2: no new findings, but a tool failed. Fix the cause it names (usually a failing test, a module
     that does not load, or Go missing from the `PATH`) and rerun. Exit 2 is never a pass. If it
     says another run is in progress, wait for that run; never kill it.
     When the message links to [troubleshooting](https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md), the fix is there.
5. Never suppress: no `//nolint`, `//lint:ignore`, build tags that hide a file from the checks,
   config `exclude`/`exceptions`, legacy entries, or weakened tests (`t.Skip` added to get past a
   failure). If a finding seems wrong, stop and ask. Never pass `--accept-policy-change` or set
   `NITPICKER_ACCEPT_POLICY_CHANGE`: a `nitpicker-config/policy-loosened` finding is for a person
   to accept.

Before you change code other packages use, or fix a bug, read
[beyond-the-gate.md](beyond-the-gate.md). Why each rule is here: [SOURCES.md](SOURCES.md).

## Write it this way

- The code compiles and `go vet` is clean, test files included. A compile error is a
  `build/compile-error` finding on its file; fix it first, since nothing else in that package is
  checked until it builds. A vet finding (`vet/printf`, `vet/copylocks`, `vet/loopclosure`...) names
  the analyzer; fix the code, not the check.
- Errors: handle or return every error. Wrap one you return with context,
  `fmt.Errorf("load order %s: %w", id, err)`, and compare with `errors.Is` and `errors.As`, never
  `==` on a wrapped error or a match on its text.
- Read environment variables, flags and config once in `main` and pass the values down. Take a
  `time.Time` source, a `*rand.Rand` and an `io.Writer` as parameters where the code needs them, so a
  test can fix them.
- Accept a `context.Context` as the first parameter of anything that does I/O or waits, and pass it
  on; never store one in a struct.
- Generated files (`// Code generated ... DO NOT EDIT.`) are not measured: change the generator or
  its input and regenerate. Never hand-edit the output.

## Repository files

- The gate fails committed secrets, binaries, build output and files over 1 MB; each message names
  the fix. Don't add an `exceptions` entry to get past one: stop and ask.

## Size and tests

- A function stays within 50 lines, 15 statements, 2 levels of control nesting and 3 parameters
  (the receiver does not count); past 3, pass a struct. `if`, `for`, `range`, `switch`, type
  switches and `select` nest; return early instead, and move a nested part into a function. An
  `else if` chain counts as one level. `if err := f(); err != nil` is one statement. Each function
  literal is a function with the same limits, counted on its own (`Outer.func1`).
- A type has at most 20 methods (across the package's files) and a struct at most 10 fields;
  split by responsibility. Interfaces are kept small by design: one to three methods, defined
  where they are used.
- A file stays within 300 lines (a `_test.go` file 500) and 120 characters per line (a tab counts
  as one). A package folder holds at most 6 files and 6 test files directly (`doc.go` does not
  count): split it into packages by what they do. A package sits at most 4 levels below the module
  root; `internal` does not count as a level.
- A function or file already over a limit may be edited but must not get worse: put new code in a
  new function or file and call it.
- Every package with code has tests; a module where no test runs fails (`no-tests-ran`). Tests are
  table-driven where cases share a shape: `tests := []struct{...}{...}` and `t.Run(tt.name, ...)`.
- A new or changed unit test runs in under 5 s (`slow-test`); an integration test in under 30 s.
  No `time.Sleep` in a test: wait on a channel or a `sync.WaitGroup`, inject the clock, and fake
  network, database and disk access behind an interface or with `httptest`. A test is integration
  when it lives under an `integration` or `e2e` folder, its file ends in `_integration_test.go`, it
  has an `integration` or `e2e` build tag, or it calls `t.Skip` under `testing.Short()`.

## When a rule flags legitimate code

Stop and ask. The maintainer adds the entry the finding's message ends with to `exceptions` in
`nitpicker.config.json`, for example
`{ "rule": "vet/printf", "paths": ["shop/label.go"], "reason": "..." }`, or
`{ "rule": "function-lines-limit", "paths": [...], "function": "Name", "reason": "..." }` for a
structure limit. That change is a policy change a person accepts.
