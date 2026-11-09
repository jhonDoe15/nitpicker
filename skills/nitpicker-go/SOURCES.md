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
- [staticcheck](https://staticcheck.dev/docs/checks/) (MIT),
  [errcheck](https://github.com/kisielk/errcheck) (MIT) and the
  [`golang.org/x/tools` analysis passes](https://pkg.go.dev/golang.org/x/tools/go/analysis/passes),
  including [modernize](https://pkg.go.dev/golang.org/x/tools/go/analysis/passes/modernize)
  (BSD-3-Clause): the lint program, run directly instead of through golangci-lint.
- [revive](https://revive.run/r) (MIT), in the same program through its library. It links
  [hashicorp/go-version](https://github.com/hashicorp/go-version) (MPL-2.0, weak copyleft) for
  Go version checks; nitpicker uses it unmodified and does not ship it (the lint program is built
  from `go.mod` on the user's machine), which the license policy allows for unmodified tools.

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
- **Editing existing code on its own page.** Every preset skill ships `editing-existing-code.md`.
  The Go page was written from runs of the real gate against a small legacy module, one branch per
  edit (growing an over-limit function, adding a parameter, extracting code, adding a helper above
  it, renaming it, cutting it into another file, `git mv` into another package, adding a function
  literal above or below another, growing an over-limit type, struct, file, folder and line,
  editing a vet line, formatting an unformatted file, editing a slow legacy test). Each bullet
  states what the gate reported, with its own message. Formatting only files that were formatted
  before matches the Python page: a formatter run rewrites lines, and line-keyed findings on them
  turn new. The rename bullet was revised once structure findings got a name-free anchor (the
  function's text with its own name masked): a rename that leaves the body as it was keeps them.
- **Table-driven tests and the slow-test limits.** Table-driven tests are the Go convention; the
  5 s / 30 s budgets and the integration markers (folders, file suffix, build tag,
  `testing.Short()`) cover the ways Go projects already separate their slow tests. The
  `testing.Short()` marker counts only as a skip guard at the top of the test (read from the
  syntax tree), because a text match let `_ = testing.Short()` lift any test to 30 s (#707).

- **Every linter check that narrows a choice, off-by-default ones included.** The preset exists to
  leave one way to write each construct, so staticcheck's non-default checks (package and doc
  comments, names, receiver names, empty branches) and the QF quick fixes run too: each picks one
  of two equivalent forms. ST1013 allows no bare status codes, because "200 is clear enough" is
  exactly the second form the preset removes.
- **errcheck with blank assignments and type assertions.** `_ = f()` hides an error as surely as
  ignoring the result, and a one-value assertion panics; the allowed forms are returning, handling
  or joining the error and the two-value assertion.
- **modernize as findings, `go fix` as the fix.** The suite rewrites only where the file's Go
  version allows the newer form, and `go fix ./...` applies every rewrite, so an agent never
  writes them by hand.
- **One finding per line and problem.** When two checks report the same line for the same
  problem, the more specific one stays (the overlap table in `docs/go-preset.md`), and checks that
  `go vet` already runs are off, so a fix never has to satisfy two messages.
- **ST1000 on the package folder.** staticcheck reports a missing package comment on whichever
  file it reads first, so adding a file moved the finding and made it new; the finding sits on
  the package folder instead.
- **`staticcheck.conf` only on opt-in.** A project config could switch checks off silently, so it
  is read only when the project opts in, and then every such file is policy.
- **revive with one setting per style rule.** revive's `enforce-*` rules exist to pick one form,
  so each gets the setting that matches the rest of the preset: literals for empty maps and
  slices (as staticcheck's own fixes write them), grouped parameter types (as gofumpt writes
  them), `default` last. Its in-code `//revive:disable` comments are blanked before revive reads
  the file, so they suppress nothing, the same contract as `//nolint`. Rules that duplicate a
  check that already runs are off with the check named, and where both report the same line the
  staticcheck finding stays; revive keeps the cases staticcheck misses.
- **revive's typed rules see the whole program.** revive's command line type-checks each package
  alone with the toolchain's export data, which fails for any import outside the standard library,
  and its typed rules then report nothing for the whole package. The lint program hands revive the
  types from its own package load instead, so those rules work in real modules; a fixture that
  imports a sibling package keeps it that way.
- **A fixture for every check.** Each enabled check has a failing line and the allowed form in
  `languages/go/lint/fixtures`; the harness fails on a missing or unexpected report, so a tool
  upgrade that changes what a check reports is caught before release.

## Rejected ideas

- **Running golangci-lint.** It is GPL-3.0 licensed, and nitpicker ships only permissively licensed
  tools. The preset reads `.golangci.*` files to follow the project's formatter but runs the
  member tools directly.
- **Forcing one formatter.** gofumpt is stricter than gofmt, but a project on gofmt is not wrong;
  the follow-the-project rule applies.
- **A Go-specific line length.** gofmt has no width and there is no measured Go convention, so the
  shared 120-character limit applies.
- **Checks that report what another check already reports.** SA1014, SA1017, SA2000, SA2002,
  SA4018, SA4021, SA5009, SA5010 and SA9006 duplicate `go vet`; S1029 duplicates SA6003; ST1023
  duplicates QF1011; vet `sortslice` duplicates SA1028. SA5005 never reports on current Go.
- **vet `shadow`.** It flags the idiomatic `if err := f(); err != nil` inside a function that has
  an outer `err`, which would push code away from Go's own convention.
- **vet `fieldalignment` and `atomicalign`.** Field order for memory layout is a performance
  choice, not a second way to write the same code; SA1027 still catches misaligned 64-bit atomics.
- **revive rules that need a project's own input or are noisy.** `add-constant` flags every numeric
  literal; `banned-characters`, `file-header`, `imports-blocklist`, `string-format` and
  `comments-density` need lists or thresholds only a project can set; `confusing-naming` reports
  whichever of two names it reads last, so its finding moves between runs; `modifies-parameter`
  and `optimize-operands-order` never reach revive's confidence floor; `unsecure-url-scheme` flags
  XML namespaces and similar identifiers. The size rules are left to the shared limits.
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

Two adversarial reviews of the linters changed these rules:

- **An analyzer that fails is a tool error.** A failed analyzer reported nothing, so a package
  could pass without being checked; only packages that do not build are skipped, because their
  compile error is already a finding.
- **Generated files are not linted**, as staticcheck's own driver does, since they cannot be fixed
  by hand.
- **Messages that count things are trimmed**: ST1016 lists how often each receiver name is used,
  so adding a method changed the message and made the finding new.
- **`staticcheck.conf` check names match case-sensitively**, as staticcheck reads them.
