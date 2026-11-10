# Linters

Part of the [nitpicker-go](../SKILL.md) skill. The gate runs staticcheck (every SA, S, ST and QF
check, and U1000), errcheck, the modernize suite, more `golang.org/x/tools` passes, revive and
catalog linters (bodyclose, sqlclosecheck, rowserrcheck, noctx, errorlint, nilerr, nilnil, errname,
contextcheck, containedctx, fatcontext) on every package, test files included. Write these forms from the start; each finding's message names the
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
  (ST1000). A doc comment on an exported name starts with the name (ST1020 to ST1022). An exported
  name does not repeat its package: `orders.List`, not `orders.OrdersList` (revive `exported`).
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
- Defer one call: keep a returned function first, `stop := start(); defer stop()`, never
  `defer start()()`.

## Shapes revive asks for

- Return early instead of nesting: no `else` after a branch that returns, breaks or continues,
  and `if !ok { return }` before the main path rather than around it.
- Return the call directly instead of `if err := f(); err != nil { return err }; return nil`, and
  assign a condition instead of `if c { x = true } else { x = false }`.
- A `switch` has at least two cases (one case is an `if`), `default` comes last, and cases with the
  same body are merged: `case a, b:`.
- Empty maps and slices are literals, `map[K]V{}` and `[]T{}` (`make` only with a size); a nil
  slice is `var items []T`. Group repeated parameter types, `first, second string`, and write
  `count++` rather than `count += 1`.
- Name every result in a `return`; no bare returns. Two unnamed results of the same type get names.
- Names: local variables start in lower case, nothing shadows an import or a builtin (`len`,
  `max`), import aliases are lower-case letters and digits and never repeat the package name, a
  `GetX` function returns something, a Unix timestamp variable ends in `Sec`, `Milli` and so on.
- File names are lower case with underscores, a package is named after its folder, and never
  `util`, `common` or a standard package name.
- An unused parameter is named `_`; an unused receiver is left unnamed, `func (Box) Name()`
  (ST1006 rejects `_`). `context.Context` is the first parameter; a `bool` parameter that picks the branch means two functions.
- A struct field's type is a named type, not an inline `struct { ... }`.
- `os.Exit` and `log.Fatal` only in `main` or `init`; `fmt.Fprintln(os.Stderr, ...)` instead of the `print`
  and `println` builtins; nothing after an `os.Exit` or `log.Fatal` call;
  no `runtime.GC()`; `t.Equal(u)` for times; `_, found := m[key]` instead of a loop over the keys;
  no `wg.Done()` or `panic` inside `wg.Go`; `m.Run()` in `TestMain` without `os.Exit`.
- A blank import (`import _ "image/png"`) belongs in the main package or a test.
- A comment has a space after `//`, except directives such as `//go:build`, and a block has no
  empty line at its start or end.

## What does not work

`//lint:ignore`, `//nolint` and `//revive:disable` comments are ignored. A project's `staticcheck.conf` is read only
when `nitpicker.config.json` opts in with
`"tools": { "staticcheck": { "precedence": ["project"] } }`, and editing one then is a policy
change. If a finding seems wrong, stop and ask.
