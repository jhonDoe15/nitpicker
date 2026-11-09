# Linters

Part of the [nitpicker-go](../SKILL.md) skill. The gate runs staticcheck (every SA, S, ST and QF
check, and U1000), errcheck, the modernize suite, gosec and more `golang.org/x/tools` passes on every
package, test files included. Write these forms from the start; each finding's message names the
allowed form and ends with its exception entry.

## Errors

- Every error is returned, handled or joined (`errcheck/unchecked`); `_ = f()` counts as
  unchecked too. Close a file you wrote to in a deferred call that joins
  the error into a named result: `defer func() { err = errors.Join(err, file.Close()) }()`.
- A type assertion takes two values, `value, ok := x.(T)`, unless a type switch fits better.
- Compare errors with `errors.Is` and `errors.As`, never `==`, `reflect.DeepEqual` or their text.
- Error strings start in lower case and end without punctuation (ST1005). A sentinel error is a
  package variable named `ErrX` (ST1012).

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

## Security (gosec)

- Random values an attacker must not guess come from crypto/rand (`rand.Text()`, `rand.Read`);
  math/rand needs an exception that says why (simulations, jitter).
- SQL takes values as query parameters, never through `fmt.Sprintf` or `+`.
- Files are written with 0o600 (or fewer bits) and folders created with 0o750 (or fewer bits); open a new file with
  `os.OpenFile(path, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0o600)` instead of `os.Create`. Temporary
  files come from `os.CreateTemp`.
- Paths, commands, URLs, redirects and templates from request input go through a fixed root
  (`os.Root`), a fixed map (`commands[key]`) or a `url.URL` built on a fixed host; log request
  values as structured `slog` fields. Archives are extracted through an `os.Root`, and
  decompression copies through `io.LimitReader`. These checks apply to test files too.
- Servers set `ReadHeaderTimeout` (`http.Server{...}.ListenAndServe()`, never
  `http.ListenAndServe`), cookies set `Secure`, `HttpOnly` and `SameSite`, TLS keeps certificate
  checks on with `MinVersion: tls.VersionTLS12`, and RSA keys have at least 2048 bits.
- Hashes and ciphers: SHA-256 or better, AES-GCM or ChaCha20-Poly1305, a fresh nonce per message;
  never MD5, SHA-1, DES, RC4, MD4 or RIPEMD-160.
- Every `context.With...` cancel function is called; integer conversions that can overflow are
  range-checked first.

## What does not work

`//lint:ignore`, `//nolint` and `#nosec` comments are ignored. A project's `staticcheck.conf` is read only
when `nitpicker.config.json` opts in with
`"tools": { "staticcheck": { "precedence": ["project"] } }`, and editing one then is a policy
change. If a finding seems wrong, stop and ask.
