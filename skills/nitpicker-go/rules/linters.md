# Linters

Part of the [nitpicker-go](../SKILL.md) skill. The gate runs staticcheck (every SA, S, ST and QF
check, and U1000), errcheck, the modernize suite, more `golang.org/x/tools` passes and catalog
linters (bodyclose, sqlclosecheck, rowserrcheck, noctx, errorlint, nilerr, nilnil, errname,
contextcheck, containedctx, fatcontext, exhaustive, recvcheck, durationcheck, makezero,
reassign, unconvert, wastedassign) on every package, test files included. Write these forms from the start; each finding's message names the
allowed form and ends with its exception entry.

## Errors

- Every error is returned, handled or joined (`errcheck/unchecked`); `_ = f()` counts as
  unchecked too. Close a file you wrote to in a deferred call that joins
  the error into a named result: `defer func() { err = errors.Join(err, file.Close()) }()`.
- A type assertion takes two values, `value, ok := x.(T)`, unless a type switch fits better.
- Compare errors with `errors.Is` and `errors.As`, never `==`, a type assertion, a type switch,
  `reflect.DeepEqual` or their text (errorlint). Wrap an error with `%w`, never `%v`. Where the
  cause must not reach callers (an API boundary), return an error of your own type or a sentinel
  instead of formatting the cause.
- A branch that checked `err != nil` returns the error, not nil (nilerr). A function returning a
  pointer, map, channel, func or interface with an error never returns `nil, nil`: return a
  sentinel error (nilnil).
- Error strings start in lower case and end without punctuation (ST1005). A sentinel error is a
  package variable named `ErrX` (ST1012), and an error type is named `XError` (errname).

## Resources and contexts

- Close an HTTP response body, and `sql.Rows` and `sql.Stmt`, in a deferred call that joins the
  error: `defer func() { err = errors.Join(err, rows.Close()) }()` (bodyclose, sqlclosecheck).
  Return `rows.Err()` after reading rows (rowserrcheck).
- Use the context forms of calls that block: `http.NewRequestWithContext`,
  `exec.CommandContext`, `db.QueryContext`, `net.Dialer.DialContext` (noctx). In tests pass
  `t.Context()`: `http.NewRequestWithContext(t.Context(), http.MethodGet, server.URL, nil)` and
  `server.Client().Do(request)`.
- A function that has a context passes it on; it never calls one that makes its own with
  `context.Background()` (contextcheck). A goroutine gets its context from a variable made
  before the `go` statement: `ctx := context.WithoutCancel(r.Context())`, then
  `go func() { work(ctx) }()`. A context is the first parameter, never a struct field
  (containedctx). In a loop, derive each iteration's context into a new variable, not into the
  loop's own (fatcontext).

## Names and comments

- Every package has a package comment, `// Package orders ...`, in one file, usually `doc.go`
  (ST1000). Every exported name has a doc comment that starts with the name (ST1020 to ST1022).
- Names use MixedCaps with upper-case initialisms: `userID`, `ServeHTTP`, `parseURL` (ST1003).
- A receiver is named after its type (`account` or `a`, never `this` or `self`), and every method
  of a type uses the same name (ST1006, ST1016).
- No dot imports (ST1001), and each package is imported once (ST1019).
- HTTP status codes are written with their constants, `http.StatusOK` and `http.StatusNotFound`
  included (ST1013).

## One form for each construct

- Write the form staticcheck's simplifications ask for: a tagged `switch value {}` over a chain of
  `if value == ...`, `strings.ReplaceAll`, `t.Equal(u)` for times, `for key := range values` without
  a blank, no nil check before `len` or `range`, a variable declared from its condition
  (`large := count > 10`).
- Use the modern forms the file's Go version allows: `any`, `for i := range n`, `min` and `max`,
  `slices.Contains`, `maps.Copy`, `strings.Cut`, `t.Context()`, `wg.Go(...)`. `go fix ./...`
  rewrites every modernize finding, so run it rather than editing by hand.
- No empty branches (SA9003), no unused values or writes (SA4006, `unusedwrite`), no unused code
  (U1000: delete it or use it), and no `break` that only ends a `switch` case.
- Defer in a loop only from a function the loop calls, so each defer runs when that call returns.
- A switch on an enum type lists every constant, even with a `default` case (exhaustive).
- All methods of a type have pointer receivers, or all have value receivers (recvcheck).
- Multiply a duration by a number, never by another duration (durationcheck). Build a slice
  you append to with `make([]T, 0, n)` (makezero). Drop conversions to the type a value already
  has (unconvert), and assignments that are overwritten before they are read (wastedassign).
- Never assign another package's variables such as `io.EOF` (reassign).

## What does not work

`//lint:ignore` and `//nolint` comments are ignored. A project's `staticcheck.conf` is read only
when `nitpicker.config.json` opts in with
`"tools": { "staticcheck": { "precedence": ["project"] } }`, and editing one then is a policy
change. If a finding seems wrong, stop and ask.
