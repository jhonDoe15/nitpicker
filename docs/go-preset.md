# Go preset

Status: slice GO1 (ticket #414) implemented. The remaining slices are listed under
[Remaining slices](#remaining-slices).

The Go preset gates a Go module (`go.mod` at the project root) with the same differential gate as
the other presets: run the tools on the merge base and on head, turn each report into findings,
and fail only on new enforceable findings.

Go already settles more than most languages: gofmt fixes the layout, the compiler rejects unused
imports and variables, and `go vet` ships with the toolchain. What is left open is how a function
is shaped, how errors are handled, which of several equivalent forms to write, how tests are
written, and the mistakes `go vet` does not look for. The preset is smaller than the others, and
its later slices add the linters and one-way rules for that remaining room.

## Selection

`"preset": "go"` in `nitpicker.config.json`. Like `java` and `python` it is never picked
silently: a project without a `preset` whose source roots hold no TypeScript or JavaScript but
that has a `go.mod` stops with a config error naming the preset to set.

The project provides Go on the `PATH` (`go version` must work). Its `GOTOOLCHAIN`, `GOFLAGS`,
`GOPROXY` and other Go settings apply. `GOFLAGS` is read with `go env GOFLAGS`, so a value set with
`go env -w` counts too, and nitpicker adds only `-buildvcs=false` to it, because a snapshot is not
always a git checkout. A missing toolchain is a `go/go-missing` tool error (exit 2), not a crash.

The pinned gofumpt and goimports need Go 1.26 or later to build. An older `go` with the default
`GOTOOLCHAIN=auto` downloads that toolchain for the build; with `GOTOOLCHAIN=local` the build fails
as a `go/go-tool-install-failed` tool error. A project that pins the formatter with a `tool`
directive runs its own version instead.

## How it works

```
node core/cli.mjs go-analyzer --project-root <snapshot>   (per snapshot)
  -> go version                                   toolchain check
  -> inspect <module root> inspect.json           structure metrics (languages/go/inspect)
  -> <formatter> -l <files>                        format check, one per formatter
  -> go vet -json ./...                            compile errors and vet diagnostics
  -> go test -vet=off -json -coverpkg=./... -coverprofile=coverage.out ./...
  -> readGoFindings -> applyFindingPolicy -> compareFindings(base, head)
```

The analyzer runs as a `nitpicker` subcommand, the way the repository-hygiene analyzer does,
instead of a separate runner script (`languages/go/adapters/go-runner.mjs`). The consumer project
is not edited and nothing is added to its `go.mod`.

**Tools.** The pinned versions live in one map (`languages/go/adapters/execution/go-tools.mjs`):
gofumpt v0.12.0 and goimports from golang.org/x/tools v0.52.0. Each is built once per version
into the nitpicker cache folder (`$XDG_CACHE_HOME/nitpicker`, else `~/.cache/nitpicker`) with
`go install <module>@<version>`, from a neutral working folder with `GOWORK=off`, so a vendored or
workspace project does not change how they build. A `tool` directive in the project's `go.mod` for
the same module runs `go tool <module>` instead, so the project's pin wins. gofmt comes with the
toolchain (`$(go env GOROOT)/bin/gofmt`) and runs without `-s`, as `go fmt` does.

**Metrics program.** `languages/go/inspect` is a small Go program on the standard library only
(`go/parser`, `go/ast`), built the same way into the cache under a hash of its sources. It lists the
module's files and measures every function, function literal and type. golangci-lint is not used:
it is GPL-3.0 licensed, so the preset runs the permissively licensed tools it bundles directly
(slice GO2).

## What runs

| Check                  | Tool                      | Finding                                                                             |
| ---------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| Format                 | gofmt, gofumpt, goimports | `<formatter>/format`, one per file                                                  |
| Compile errors         | `go vet`                  | `build/compile-error` at the position the compiler names                            |
| Vet                    | `go vet` (all analyzers)  | `vet/<analyzer>`, for example `vet/printf`                                          |
| Failing tests          | `go test -json`           | `tests/tests-failed` tool error quoting each failure                                |
| No tests ran           | `go test -json`           | `tests/no-tests-ran`                                                                |
| Slow tests             | `go test -json`           | `test-runtime/slow-test`                                                            |
| Function limits        | metrics program           | `structure/function-*-limit`                                                        |
| Type limits            | metrics program           | `structure/class-methods-limit`, `class-fields-limit`                               |
| File and folder limits | metrics program           | `file-lines-limit`, `line-length-limit`, `folder-files-limit`, `folder-depth-limit` |
| Repository hygiene     | shared                    | committed secrets, binaries, build output, large files                              |

## Format check: following the project

gofmt, gofumpt and goimports are all common, and none is wrong, so the preset runs the one the
project uses and never flags the choice. The first signal found decides:

1. `"go": { "formatters": ["gofumpt", "goimports"] }` in `nitpicker.config.json`.
2. `tool` directives in `go.mod` for `mvdan.cc/gofumpt` or `golang.org/x/tools/cmd/goimports`.
3. The `formatters.enable` list (golangci-lint v2) or `linters.enable` list (v1) of a
   `.golangci.yml`, `.golangci.yaml`, `.golangci.toml` or `.golangci.json`. Reading that file is
   not running golangci-lint. A file that does not parse is a `go/golangci-config-invalid` tool
   error.
4. Nothing: gofmt, which every Go project already follows.

gofmt is dropped when a stricter formatter is chosen, since gofumpt and goimports both apply
gofmt's layout. Each file a formatter would change is one `<formatter>/format` finding whose
message names the formatter, where the choice came from, and the command that fixes it.
The choice is read from the head checkout for both snapshots, so a change that adopts gofumpt is
checked against a merge base formatted with gofumpt too, and only the files the change touches
can fail. `go.mod` and the golangci-lint files are inputs of the format check, so editing them
re-runs it. Dropping a formatter from `go.formatters` (other than gofmt, which every other
formatter covers) or a tag from `go.buildTags` is a policy loosening a person accepts.
Generated files (`// Code generated ... DO NOT EDIT.`) are not checked.

Formatter options are read from the golangci-lint file only when the project opts in with
`"tools": { "goimports": { "precedence": ["project"] } }` (or `gofumpt`), as in the other presets:
goimports' `local-prefixes` becomes `-local`, and gofumpt's `extra-rules` and `module-path` become
`-extra` and `-modpath`. The opted-in file then counts as policy, so an edit of it is a policy
change a person accepts.

## Build and vet

`go vet -json ./...` compiles every package, test files included, and runs every default vet
analyzer. Its JSON diagnostics become `vet/<analyzer>` findings; a compile error becomes a
`build/compile-error` finding on its file, whose message says to fix it before anything else. A
finding's identity is the message (without line numbers) plus the trimmed source line, numbered
per occurrence, so moving code does not make it new. When vet exits with an error and reports
nothing it can parse (a module that cannot load, a missing dependency), the snapshot is a
`go/go-vet-failed` tool error quoting the output.

`go.buildTags` (for example `["integration"]`) is passed as `-tags` to vet and the tests, so files
behind those tags are built and checked.

## Tests

`go test` runs with `-json` over every package. `-vet=off` keeps it from failing a build on a vet
finding (vet already ran), and `-coverpkg=./...` makes each package's coverage include what other
packages' tests exercise; the coverage profile is what slice GO4 gates on. Go does not cache a
run that writes a coverage profile, so every test runs and its time is measured.

- A failing test makes the snapshot a `tests/tests-failed` tool error (exit 2) that lists up to 20
  failing tests with the first lines each printed, as in the Python preset. Only the deepest
  failing subtest is listed, and a package that failed to build is not, because its compile error
  is already a finding.
- A module where no test ran gets `tests/no-tests-ran`, unless a build failure stopped them.
- **Slow tests** use the shared `slow-test` limits: a new or changed top-level test over the unit
  budget (5 s) fails, and an integration test gets the integration budget (30 s). A test counts as
  integration when it lives under an `integration`, `integration_tests`, `e2e` or `end_to_end`
  folder, its file ends in `_integration_test.go` or `_e2e_test.go`, the file has an `integration`
  or `e2e` build constraint, or the test skips under `testing.Short()`. A test over its budget is
  run again alone (`-run '^Name$' -count=1`) and the fastest time counts, so a busy machine does
  not fail it. A test is "changed" when its function's text differs from the merge base.

## Structure limits

The metrics program measures each function and method:

- **Lines** span the `func` line to the closing brace; the doc comment does not count.
- **Statements** count every statement except blocks, labels (the labelled statement counts) and
  empty statements. The init and post parts of `if`, `for` and `switch` are not counted, so
  `if err := f(); err != nil` costs one statement.
- **Control nesting** counts `if`, `for`, `range`, `switch`, type switches and `select`. An
  `else if` stays at its chain's level, as in the other presets.
- **Parameters** count each name (`a, b int` is two); the receiver is not a parameter.
- A **function literal** is a unit of its own, named `Outer.func1`, `Outer.func2`, and is not part
  of its parent's statements or nesting.

The shared limits apply: 50 lines, 15 statements, nesting 2, 3 parameters. A legacy function over a
limit may be edited but must not get worse.

Types: methods are counted per named type across the package's non-test files, and fields per
struct (each name counts). `class-methods-limit` and `class-fields-limit` apply to structs and
other named types. Interfaces are not held to the methods limit, as Python's protocols are not;
their size is a lint question for slice GO2. Go has no inheritance (embedding is composition), so
`inheritance-depth-limit` does not apply and `thresholds.inheritanceDepth` is a config error.

## File limits

The shared file limits apply to `.go` files: 300 lines (500 for `_test.go`), 120 characters per line
(gofmt has no width; a tab counts as one character, like everywhere else), and 6 files and 6 test
files per package folder. A `doc.go` file does not count towards its folder.

Packages more than 4 levels below the module root fail `folder-depth-limit`, like Java and Python.
`internal` is an access marker, not a level, so `internal/shop/orders` is two levels deep.
`testdata` and `vendor` folders, folders starting with `.` or `_`, and folders with their own
`go.mod` (another module) are skipped, as the go tool skips them.

## Exceptions

The top-level `exceptions` take a finding as it is printed, `<tool>/<rule>` (`vet/printf`), as in
the Java preset, plus the shared rules (the function, type, file and folder limits, `slow-test`, and
the repository checks). Every vet, limit and slow-test message ends with its exception entry, for
example `{"rule":"vet/printf","paths":["shop/label.go"],"reason":"..."}`. Format findings,
compile errors and `no-tests-ran` have no exception route: run the formatter, fix the build, or
add a test.

## Config keys

| Key                                                      | Meaning                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `go.formatters`                                          | `gofmt`, `gofumpt` and/or `goimports`; pins the format check |
| `go.buildTags`                                           | build tags passed as `-tags` to vet and the tests            |
| `tools.gofumpt.precedence`, `tools.goimports.precedence` | read the formatter's options from the golangci-lint config   |
| `thresholds`, `exclude`, `exceptions`, `legacyInventory` | shared with every preset                                     |

`react` and `i18n` (TypeScript only), `layout` (Go packages follow the module, so there are no
source roots to set) and `duplicates` (no duplicate-code scan runs yet, see GO5) are config errors
with `"preset": "go"`, each naming its reason.

## Tests of the preset

- Unit tests next to the adapters (`languages/go/adapters/**.test.mjs`) and the metrics program's
  own Go tests (`languages/go/inspect/inspect_test.go`).
- End-to-end suites in `languages/go/adapters/e2e/`, run with `npm run test:go` (they need Go on the
  `PATH` and skip without `NITPICKER_GO_E2E=1`). They build throwaway git repositories and run
  the real CLI on them: a clean change, gofmt, vet, a compile error, a nested function next to an
  untouched legacy one, exceptions, failing and slow tests, build tags, gofumpt from a golangci-lint
  file, a change that adopts gofumpt, and a missing toolchain. CI runs them in the `go-e2e` workflow.

## Remaining slices

| #   | Slice                                           | Scope                                                                                                                                                                        |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GO1 | Base (#414)                                     | This document: done.                                                                                                                                                         |
| GO2 | Linters (#415)                                  | staticcheck (every check, including the off-by-default ones that fit), revive, errcheck, gosec and the permissively licensed `go/analysis` linters, in one program.          |
| GO3 | One-way rules (#416)                            | nitpicker's own analyzers for the forms Go still leaves open (error wrapping and comparison, constructors, receivers, loops, context), each message naming the allowed form. |
| GO4 | Coverage, CRAP and mutation (#417)              | changed-branch coverage and CRAP from the coverage profile; mutation testing.                                                                                                |
| GO5 | Duplicates, coupling, dead code, modules (#418) | clones, package coupling and stability, unused code, and `go mod tidy -diff`.                                                                                                |
| GO6 | Shared guards and test honesty (#419)           | the guards the other presets share (secrets in code, path joins, subprocess timeouts, test assertions), after GO3.                                                           |
| GO7 | Race detector (#433)                            | `go test -race`, with each race a finding keyed by its stacks.                                                                                                               |

## Known limits

- One module per run: the module at the project root. A nested module (its own `go.mod`) and a
  `go.work` workspace's other modules are not analyzed.
- Generated files are listed but not measured or format-checked; they still compile and vet.
- The tools are built from the Go module proxy on first use, so the first run needs network access
  (or a `GOPROXY` the project sets) and takes longer.
