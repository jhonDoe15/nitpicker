# Sources and decisions

Why this skill says what it says. The preset itself is described in the repository's
`docs/go-preset.md`; this page records where each rule comes from and what was rejected.

## Origin and use case

The maintainers asked whether Go, whose compiler and gofmt already settle much of its style, still
leaves room for style preferences, anti-patterns and mistakes that coding agents fall into. It
does: error handling, how a function is shaped, which of several equivalent forms to write, test
style and concurrency are all left to the author. So the Go preset exists, deliberately smaller
than the others, and this skill teaches its rules before an agent writes Go.

## Sources

- [Effective Go](https://go.dev/doc/effective_go) and
  [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments): the community's baseline for
  error handling, interface size, receivers and package layout.
- [Google Go Style Guide](https://google.github.io/styleguide/go/) (guide, decisions and best
  practices): table-driven tests, error wrapping with `%w`, contexts as the first parameter and
  never in structs.
- [Uber Go Style Guide](https://github.com/uber-go/guide/blob/master/style.md): goroutine
  ownership, channel closing, mutex placement, zero-value handling in wrappers.
- [`go vet` analyzers](https://pkg.go.dev/cmd/vet) and [gofumpt](https://github.com/mvdan/gofumpt):
  what the gate runs today.
- The shared rules of the other presets (size limits, slow tests, repository hygiene), applied to
  Go where they fit.

## Rules and their reasoning

- **Finish with the gate, never suppress.** Same contract as every other preset: the gate is the
  backstop and a person accepts every loosening. `//nolint` and `//lint:ignore` are named because
  they are the Go spellings of a suppression that agents reach for.
- **Format with the project's formatter.** gofmt, gofumpt and goimports are all common and none is
  wrong, so the preset follows the project's choice (from `go.mod` tool directives or the
  golangci-lint config) and never flags it; the skill only says to run the formatter the finding
  names.
- **Compile and vet first.** A package that does not build hides every other check in it, so the
  compile error is its own finding and the skill puts it first.
- **Errors wrapped with `%w`, compared with `errors.Is`/`errors.As`.** All three style guides agree,
  and comparing wrapped errors with `==` or their text is the most common Go error bug. Enforced
  rules for it come with the one-way rules slice; until then the skill carries it.
- **Configuration read once in `main`; clocks, randomness and writers passed in.** Matches the
  composition-root rule of the other presets and makes tests deterministic.
- **`context.Context` first, never stored.** From Go Code Review Comments and the Google guide.
- **Size limits.** The shared limits (50 lines, 15 statements, nesting 2, 3 parameters, 300-line
  files, 6 files per folder, depth 4), measured with Go's own syntax tree. The receiver is not a
  parameter, `if err := f(); err != nil` is one statement and an `else if` chain is one level, so
  idiomatic Go is not penalized for its shapes.
- **Types: 20 methods, 10 fields; interfaces exempt from the method limit.** The shared class
  limits, with Go wording. Interfaces are small by Go convention ("the bigger the interface, the
  weaker the abstraction"), which is a lint question rather than a size limit.
- **Table-driven tests and the slow-test limits.** Table-driven tests are the Go convention; the
  5 s / 30 s budgets and the integration markers (folders, file suffix, build tag,
  `testing.Short()`) cover the ways Go projects already separate their slow tests.

## Rejected ideas

- **Running golangci-lint.** It is GPL-3.0 licensed, and nitpicker ships only permissively licensed
  tools. The preset reads `.golangci.*` files to follow the project's formatter but runs the
  member tools directly.
- **Forcing one formatter.** gofumpt is stricter than gofmt, but a project on gofmt is not wrong;
  the follow-the-project rule applies.
- **A Go-specific line length.** gofmt has no width and there is no measured Go convention, so the
  shared 120-character limit applies.
- **Holding interfaces to the method limit.** Interface size is better judged by a linter that
  knows where the interface is used.

## Review findings

Two adversarial reviews of the first version changed these rules:

- **The formatter comes from the head checkout for both snapshots.** Read per snapshot, a change
  that adopted gofumpt failed every untouched file the merge base had formatted with gofmt. The
  Python preset had the same gap and reads its formatter the same way now.
- **Dropping a formatter or a build tag is a loosening**, and an opted-in golangci-lint file is
  policy, so neither can quietly check less.
- **Function literals in package variables are measured.** A handler assigned to a `var` escaped
  every function limit.
- **A test that times out next to a failing subtest is still reported**, and a timed-out package
  quotes the output of the test that was running.
- **Marking a kept file generated is a policy change**, as in the other presets, because the
  gate skips generated files. The header follows Go's `ast.IsGenerated` rule: it must come before
  the package clause.
- **`layout` and `duplicates` are config errors with their reason**, not silently ignored.
- **The project's `GOFLAGS` is read with `go env`**, so `go env -w` settings apply, and the tools
  build from a neutral environment so the project's `GOOS` or `GOFLAGS` cannot break them.
