# Go preset

Status: slices GO1 (ticket #414), GO5 (ticket #418) and GO7 (ticket #433) implemented, the first
two parts of slice GO2 (#415): staticcheck, errcheck, modernize, the extra `golang.org/x/tools`
passes and revive, and slice GO3 (#416): nitpicker's own rules for errors, concurrency, package
state, design and I/O. The remaining slices are listed under [Remaining slices](#remaining-slices).

The Go preset gates a Go module (`go.mod` at the project root) with the same differential gate as
the other presets: run the tools on the merge base and on head, turn each report into findings,
and fail only on new enforceable findings.

Go already settles more than most languages: gofmt fixes the layout, the compiler rejects unused
imports and variables, and `go vet` ships with the toolchain. A condition must be a `bool`, so
`if count {` cannot hide a zero; the TypeScript and Python presets report that slip as
`nitpicker/strict-boolean-expressions` and `number-truthiness`. What is left open is how a function
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

The pinned gofumpt and goimports need Go 1.26 or later to build, and the lint program Go 1.27
(see [How it works](#how-it-works)). An older `go` with the default `GOTOOLCHAIN=auto` downloads
that toolchain for the build; with `GOTOOLCHAIN=local` the build fails as a
`go/go-tool-install-failed` tool error (`go/go-lint-build-failed` for the lint program). A project
that pins the formatter with a `tool` directive runs its own version instead.

## How it works

```
node core/cli.mjs go-analyzer --project-root <snapshot>   (per snapshot)
  -> go version                                   toolchain check
  -> inspect <module root> inspect.json           structure metrics (languages/go/inspect)
  -> <formatter> -l <files>                        format check, one per formatter
  -> go vet -json ./...                            compile errors and vet diagnostics
  -> lint ./...                                    staticcheck, errcheck, modernize, revive, catalog linters,
                                                   go-rules (languages/go/lint)
  -> go test -vet=off -json -race -covermode=atomic -coverpkg=./... -coverprofile=coverage.out ./...
  -> jscpd --format go (plain, then over renamed sources)  duplicates
  -> go mod tidy -diff                             unused and unlisted requirements
  -> deadcode -json ./...                          unreachable functions (modules with a main package)
  -> readGoFindings -> applyFindingPolicy -> compareFindings(base, head)

node core/cli.mjs go-analyzer --part mutation --project-root <snapshot>   (head only, after go)
  -> inspect mutants <module root> targets.json mutants.json      mutants of the changed lines
  -> go test -json -covermode=atomic -coverpkg=./... ./...         baseline, coverage, timings
  -> go test -json -failfast -overlay=<mutant> <test packages>     once per mutant
```

The analyzer runs as a `nitpicker` subcommand, the way the repository-hygiene analyzer does,
instead of a separate runner script (`languages/go/adapters/go-runner.mjs`). The consumer project
is not edited and nothing is added to its `go.mod`.

**Tools.** The pinned versions live in one map (`languages/go/adapters/execution/go-tools.mjs`):
gofumpt v0.12.0, and goimports and deadcode from golang.org/x/tools v0.52.0 (BSD-3-Clause). Each is built once per version
into the nitpicker cache folder (`$XDG_CACHE_HOME/nitpicker`, else `~/.cache/nitpicker`) with
`go install <module>@<version>`, from a neutral working folder with `GOWORK=off`, so a vendored or
workspace project does not change how they build. A `tool` directive in the project's `go.mod` for
the same module runs `go tool <module>` instead, so the project's pin wins. gofmt comes with the
toolchain (`$(go env GOROOT)/bin/gofmt`) and runs without `-s`, as `go fmt` does.

**Metrics program.** `languages/go/inspect` is a small Go program on the standard library only
(`go/parser`, `go/ast`), built the same way into the cache under a hash of its sources. It lists the
module's files and measures every function, function literal and type. It also lists each file's
top-level declarations and the names it uses, which the duplicates, coupling and dead-code checks
read (see [Facts](#facts)). golangci-lint is not used:
it is GPL-3.0 licensed, so the preset runs the permissively licensed tools it bundles directly
(slice GO2).

**Lint program.** `languages/go/lint` is a second Go program that loads the module's packages once
(`golang.org/x/tools/go/packages`, test files included) and runs every linter in
[Linters](#linters) over them. Its module pins staticcheck 2026.2.2 (`honnef.co/go/tools` v0.8.2,
MIT), errcheck v1.30.0 (MIT) and `golang.org/x/tools` v0.52.0 (BSD-3-Clause) in its `go.sum`, and
it needs Go 1.27 to build: with an older `go` and the default `GOTOOLCHAIN=auto` the build downloads
Go 1.27, and with `GOTOOLCHAIN=local` it fails as a `go/go-lint-build-failed` tool error. When the
project's own toolchain (`go env GOVERSION`) is newer than Go 1.27, the program is built with that
toolchain, so its type checker reads every language feature the project may use. It is built once
per source hash and toolchain into the nitpicker cache.

## What runs

| Check                  | Tool                       | Finding                                                                             |
| ---------------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| Format                 | gofmt, gofumpt, goimports  | `<formatter>/format`, one per file                                                  |
| Compile errors         | `go vet`                   | `build/compile-error` at the position the compiler names                            |
| Vet                    | `go vet` (all analyzers)   | `vet/<analyzer>`, for example `vet/printf`                                          |
| More vet passes        | lint program               | `vet/<analyzer>`, for example `vet/nilness`                                         |
| staticcheck            | lint program               | `staticcheck/<check>`, for example `staticcheck/SA4006`                             |
| Unchecked errors       | lint program (errcheck)    | `errcheck/unchecked`                                                                |
| Modern forms           | lint program (modernize)   | `modernize/<analyzer>`, for example `modernize/rangeint`                            |
| Own one-way rules      | lint program (go-rules)    | `go-rules/<rule>`, for example `go-rules/panic-for-failure`                         |
| Failing tests          | `go test -json`            | `tests/tests-failed` tool error quoting each failure                                |
| Data races             | `go test -race`            | `race/data-race`, one per pair of conflicting functions                             |
| No tests ran           | `go test -json`            | `tests/no-tests-ran`                                                                |
| Slow tests             | `go test -json`            | `test-runtime/slow-test`                                                            |
| Branch coverage        | coverage profile           | `coverage/changed-branch-coverage`                                                  |
| CRAP                   | coverage profile           | `crap/crap-score-limit`, `crap/crap-coverage-unknown`                               |
| Mutation testing       | metrics program, `go test` | `mutation/mutant-survived`, `mutation/mutant-nocoverage`, `mutation/mutant-timeout` |
| Function limits        | metrics program            | `structure/function-*-limit`                                                        |
| Type limits            | metrics program            | `structure/class-methods-limit`, `class-fields-limit`                               |
| File and folder limits | metrics program            | `file-lines-limit`, `line-length-limit`, `folder-files-limit`, `folder-depth-limit` |
| Duplicates             | jscpd, renamed-clone pass  | `duplicates/duplicate-clone`                                                        |
| Package coupling       | metrics program            | `coupling/stability-direction`                                                      |
| Feature layout         | metrics program            | `facts/shared-used-by-one-feature`                                                  |
| Test-only code         | metrics program            | `facts/test-only-export`                                                            |
| Unreachable code       | `deadcode`                 | `deadcode/unreachable-func`                                                         |
| Module requirements    | `go mod tidy -diff`        | `dependencies/unused-dependency`, `dependencies/unlisted-dependency`                |
| Repository hygiene     | shared                     | committed secrets, binaries, build output, large files                              |

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
packages' tests exercise; the coverage profile is what the coverage and CRAP checks read. Go does not cache a
run that writes a coverage profile, so every test runs and its time is measured.

- A failing test makes the snapshot a `tests/tests-failed` tool error (exit 1) that lists up to 50
  failing tests with the `file_test.go:line` and message they printed (and testify's expected and
  actual values), as in the other presets. Only the deepest
  failing subtest is listed, and a package that failed to build is not, because its compile error
  is already a finding.
- A module where no test ran gets `tests/no-tests-ran`, unless a build failure stopped them.
- **Data races.** The tests run under the race detector (`-race`, with `-covermode=atomic`, which
  `-race` needs). Each race report becomes one `race/data-race` finding on the file of its first
  access. The message names both conflicting accesses (read or write, the function and its
  `file:line`, the first frame of each stack inside the module) and the test that found it. The
  finding is keyed by the two functions (closures without their `func1`, `func2` numbers),
  whichever access the detector printed first, so a race the merge base already had is not new,
  and the same race found by several tests is one finding. A side whose stack the detector could
  not restore, or that has no frame inside the module, is still named as well as the report allows.
  A data race is never intended, so the finding has no exception route.
- **Tests that fail only under `-race`.** The race detector fails every test that ran during a
  race, parallel tests included, and slows tests 2 to 20 times. So when a package printed a race
  report, timed out, hit the detector's goroutine limit or was killed, its failing tests run once
  more without `-race` (`-run` with their names, `-count=1`). The ones that pass are left out of
  `tests/tests-failed`: a race report is already a finding. A failure with no race report in its
  package (a timeout under the slowdown) adds a descriptive `race/race-not-checked` finding naming
  the tests. A test that fails without `-race` too stays a failing test, with the race report taken
  out of its quoted output.
- **Without the race detector.** `-race` needs cgo (`CGO_ENABLED=1` and a C compiler on the
  `PATH`) and a platform the detector supports. When `go test -race` reports that it cannot run
  (cgo off, an unsupported platform, a race runtime that does not build, ThreadSanitizer refusing
  the machine's memory layout) or does not finish within the tool time limit, the tests run again
  without it, and a descriptive `race/race-not-checked` finding says why. Every
  `race/race-not-checked` finding of head is listed under "Notices (not failing)" on every run, so a
  report never claims races were checked when they were not. Whether cgo is on is part of the
  analyzer version, so a cached merge base result from a machine with cgo is not compared with a
  head run without it.
- **Slow tests** use the shared `slow-test` limits: a new or changed top-level test over the unit
  budget (5 s) fails, and an integration test gets the integration budget (30 s). A test counts as
  integration when it lives under an `integration`, `integration_tests`, `e2e` or `end_to_end`
  folder, its file ends in `_integration_test.go` or `_e2e_test.go`, the file has an `integration`
  or `e2e` build constraint, or the test skips under `testing.Short()`. That last marker is read
  from the syntax tree: the test's first statement (after any `t.Parallel()` or `t.Helper()`) is
  `if testing.Short() { t.Skip(...) }` (the condition may be `testing.Short() || ...`; the block
  may log with `t.Log` or `t.Logf` and then call `t.Skip`, `t.Skipf`, `t.SkipNow` or `return`), or
  the whole body sits in `if !testing.Short() { ... }` with no `else` or an `else` that only skips.
  Reading `testing.Short()` anywhere else, such as to log or into `_`, or running anything else
  before the skip does not count, because that code still runs under `go test -short`. A test over
  its budget is run again alone (`-run '^Name$' -count=1`) and the fastest time counts, so a busy
  machine does not fail it. The rerun is without `-race`, so the race detector's slowdown never
  counts towards the budget. A test is "changed" when its function's text differs from the merge
  base.
- **Test output** (`test-runtime/test-console-output`): a line a test prints that the base run did
  not print fails, on the test's file, compared as text with numbers and paths normalized (see
  `testConsole.allow` to accept a third-party message). `go test` writes a test's stdout and
  stderr into one stream, so the level decides what counts, in place of the stream: a line at
  `WARN` or `ERROR` level or above (`level=WARN`, `"level":"error"`, a `WARN` or `ERROR` word, a
  klog `W` or `E` line), and a standard `log` line (`2026/11/10 10:00:00 ...`, which writes to
  stderr) unless it carries a lower level (`INFO`, `[INFO]`, `info:`). A plain `fmt.Println` does
  not count, as stdout does not in the other presets. `t.Log` and `t.Error` lines, `=== RUN` and `--- PASS` lines and
  race reports (the race detector has its own finding) never count. Output outside any test
  (`TestMain`, `init`) is reported on the package folder.

## Branch coverage and CRAP

`go test -coverprofile` records statement blocks and how often each ran (`-covermode=atomic`, so
counts stay exact when tests run in parallel and under `-race`), not branches. The metrics program
lists every branch point of each function with `go/ast`, and the profile's blocks stand in for its
outcomes:

| Branch point          | Outcomes                                                              |
| --------------------- | --------------------------------------------------------------------- |
| `if`                  | the if body, and the else branch or, without one, the condition false |
| `switch`, type switch | each case, and "no case matching" when there is no `default`          |
| `select`              | each case                                                             |
| `for`, `range`        | the loop body                                                         |

An outcome with a block of its own (a body, an else branch, a case) is taken when its block ran; an
empty body counts too. An outcome without one (the condition false, no case matching) is taken when
the branch point was evaluated more often than its arms were entered: the count of the block holding
the `if` or `switch` keyword minus the counts of its arms. A case reached by `fallthrough` also
counts the runs that fell into it, so the runs that reached a `fallthrough` statement are taken off
first. A loop's exit is not an outcome: it is taken whenever the loop ends. `&&` and `||` are not
split into outcomes; the profile records no blocks inside a condition.

- **`changed-branch-coverage`** fails a branch point with less than 95% of its outcomes taken, and
  names the ones not taken (`Not taken: the if body (line 4)`). It is keyed by its function and the
  trimmed source line, so only a branch point the change wrote or edited is new. Its exception names
  the function, as in the other presets.
- **`crap-score-limit`** scores each function and function literal as
  `complexity² × (1 − coverage)³ + complexity`. The complexity is the metrics program's cyclomatic
  complexity, and the coverage is the function's statement coverage: the statements of the blocks
  that ran, its literals left out, as in the Python preset. A function over the limit (9, or
  `thresholds.crapLimit`) fails; an edited legacy function fails only when its score rose.
- **`crap-coverage-unknown`** fails a new or changed function when no test wrote a profile at all.
- Some files are not scored:
  - a file the profile does not list, such as one a build constraint leaves out (`_windows.go` on
    Linux);
  - the files of a package that did not build, because the build error is already a finding;
  - the files of a package whose test binary crashed (a panic, a timeout, `os.Exit`). Such a binary
    writes no profile, and the failing test is already a finding.

## Mutation testing

Mutation testing is the `mutation` analyzer, which runs after the `go` analyzer on the head
snapshot; `"disable": ["mutation"]` turns it off, as in the Python preset. No Go mutation tool fits:
go-mutesting is unmaintained and rewrites files in place, and gremlins mutates the whole module with
a fixed operator set. So the metrics program writes the mutants (`inspect mutants`) and each one
runs through `go test -overlay`, which compiles the mutated copy of the file without touching the
checkout.

**Operators**, named after Stryker's where the mutation is the same, so the messages read alike in every preset:

| Operator                | Mutation                                                                    |
| ----------------------- | --------------------------------------------------------------------------- |
| `ArithmeticOperator`    | `+` and `-`, `*` and `/`, `%` to `*`                                        |
| `EqualityOperator`      | `==` and `!=`; `<` to `<=` and `>=`, and the other comparisons the same way |
| `LogicalOperator`       | `&&` and `\|\|`                                                             |
| `BitwiseOperator`       | `&` and `\|`, `^` and `&^` to `&`, `<<` and `>>`                            |
| `UnaryOperator`         | removes `-`, `!` or `^`                                                     |
| `UpdateOperator`        | `++` and `--`                                                               |
| `AssignmentOperator`    | `+=` and `-=`, `*=` and `/=`, and the other compound assignments            |
| `BooleanLiteral`        | `true` and `false`                                                          |
| `StringLiteral`         | a non-empty string to `""` (import paths and struct tags are left alone)    |
| `ConditionalExpression` | an `if` condition to `true` and to `false`, a `for` condition to `false`    |
| `RemovedCall`           | removes a call statement                                                    |
| `LoopControl`           | an unlabelled `break` and `continue` swapped                                |
| `SwitchCase`            | empties a case body                                                         |

**Scope.** As in the TypeScript preset, head mutates only the lines the change adds or edits in
non-test files, so every surviving mutant it reports is new; `--all` (or a run without a base)
mutates every file. When the change edits or deletes a `_test.go` file, the non-test files of that
folder are mutated whole (at most 10 files; a `tested-modules-capped` note names the rest, as in
the TypeScript preset; a rename that keeps the content does not count). A mutant there that
survives (or that no test runs) is run again against the base checkout's tests, and it fails only
if the base tests caught it: "This change weakened the
tests of `shop/rate.go`: the base tests caught this EqualityOperator mutant (`>` replaced with
`>=`), but it survives now." A head mutant is paired with its base twin by file, function,
operator, replacement, the trimmed line text and column, and its place among equal mutants of the
same function. Generated files, test files, files the build leaves out and `exclude` globs are not
mutated, and neither are type parameters, array lengths, struct tags or raw strings with a carriage
return (the parser drops it, so the mutant would not compile). A mutation that spans lines, such as
a removed multi-line call, is in scope when any of its lines changed.

**Each mutant** runs the tests of every package whose test binary imports its package
(`go list -test`), with `-failfast` and a timeout of five times their baseline time (30 s at
least):

- `mutant-survived` (enforceable): the tests pass with the mutant. The message shows the
  replacement.
- `mutant-nocoverage` (enforceable): no test package imports the package, or the coverage profile
  says the mutant's block never ran. Such a mutant is not run.
- `mutant-timeout` (descriptive): the tests ran past the timeout, which usually means the mutant
  made a loop endless. The run's whole output is read for Go's timeout panic, since with
  `t.Parallel` it can land on another test than the one that hung.
- A mutant that does not compile (an unused variable after a removed call, for example) is not a
  finding, only a count in the `mutation-summary` metrics; a killed one is the goal.

A mutant whose test packages fail on head is skipped, and a `mutation-skipped` note counts them and
names the failing packages; the failing tests are already a tool error of the `go` analyzer.
Findings are keyed by function, operator and replacement, so they survive line moves; their
exceptions name the function, as in the other presets.

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

## Linters

The lint program runs these, each message followed by the allowed form where the tool's own
message does not already name it, and by its exception entry:

- **staticcheck**: every check in SA, S, ST and QF, and U1000 (unused code), including the ones
  staticcheck leaves off by default (SA9003 empty branches, ST1000 package comments, ST1003 names,
  ST1016 receiver names, ST1020 to ST1022 doc comments). The QF checks are the forms gopls offers as
  quick fixes (tagged switches, `strings.ReplaceAll`, `time.Time.Equal`, declaring a variable from
  its condition), so each one narrows a choice to one form. ST1013 has no allowed status codes:
  every status is written with its `http.Status...` constant, 200 and 404 included. ST1000 is a
  finding on the package folder, not on whichever file staticcheck picks, so adding a file does
  not make it new.
- **errcheck** with blank assignments (`_ = f()`) and type assertions (`x.(T)` without `, ok`)
  checked: every error is returned, handled or joined into a named error result
  (`defer func() { err = errors.Join(err, file.Close()) }()`).
- **modernize**: the suite `go fix` applies (`any`, `for range n`, `min`/`max`, `slices.Contains`,
  `maps.Copy`, `strings.Cut`, `t.Context()`, `WaitGroup.Go` and the rest). Each applies only
  where the file's Go version allows the new form; `go fix ./...` rewrites them.
- **More `golang.org/x/tools` passes** that `go vet` leaves out: deepequalerrors, gofixdirective,
  httpmux, inline (calls to functions marked `//go:fix inline`), nilness, reflectvaluecompare,
  scannererr and unusedwrite.
- **revive** (MIT), run as a library over the packages the program already loaded: every rule
  that narrows a choice to one form or catches a mistake the other tools miss. The configurable
  ones get one setting each:

  | Rule                              | Setting                                      | Why                                                                  |
  | --------------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
  | `enforce-map-style`               | `literal`: `map[K]V{}`                       | `make` stays for a sized map, `make(map[K]V, n)`, where it says more |
  | `enforce-slice-style`             | `literal`: `[]T{}`                           | the same form as maps; `var items []T` stays for a nil slice         |
  | `enforce-repeated-arg-type-style` | `short`: `first, second string`              | the form gofumpt's `-extra` mode writes                              |
  | `enforce-switch-style`            | `default` last, a switch may have none       | ST1015 allows first or last; one place is enough                     |
  | `filename-format`                 | `^[a-z0-9]+(_[a-z0-9]+)*\.go$`               | lower case with underscores, the form the go tool's own suffixes use |
  | `exported`                        | only the stutter check (`orders.OrdersList`) | ST1020 to ST1022 check doc comments; a doc comment is not required   |

  The rules on: bare-return, blank-imports, bool-literal-in-expr, call-to-gc, comment-spacings,
  confusing-results, context-as-argument, datarace, deep-exit, defer (deferred call chains too:
  `stop := start(); defer stop()`, not `defer start()()`), early-return, empty-block, empty-lines,
  the four `enforce-*` styles, exported (stutter only), epoch-naming, filename-format, flag-parameter,
  forbidden-call-in-wg-go, get-return, identical-branches, identical-ifelseif-branches,
  identical-switch-branches, identical-switch-conditions, if-return, import-alias-naming,
  import-shadowing, increment-decrement, indent-error-flow, inefficient-map-lookup,
  marshal-receiver, modifies-value-receiver, multiline-if-init, nested-structs,
  package-directory-mismatch, package-naming, range-val-address (Go before 1.22),
  redefines-builtin-id, redundant-import-alias, redundant-test-main-exit, struct-tag,
  superfluous-else, time-date, time-equal, unexported-naming, unexported-return,
  unnecessary-format, unnecessary-if, unnecessary-stmt, unreachable-code (only after `os.Exit`,
  `log.Fatal` and the like; `go vet` reports code after `return` and `panic`), unused-parameter,
  unused-receiver, use-fmt-print, useless-break, useless-fallthrough and var-declaration. revive's own confidence
  floor (0.8) applies, as its command line applies it. `package-naming` is a finding on the package
  folder, like ST1000, because revive reports it from whichever file it reads first. The rules
  that need types (epoch-naming, inefficient-map-lookup, time-equal, unexported-return and
  others) get them from the program's own package load, so third-party and sibling-package types
  are known. revive's command line type-checks each package on its own and loses every type in a
  package that imports anything outside the standard library. With gofumpt as the formatter,
  `comment-spacings` and `empty-lines` are dropped in a file gofumpt would rewrite, because its
  format finding covers the same lines.

- **Catalog linters**, permissively licensed `go/analysis` linters that golangci-lint also bundles,
  run directly, each under its own tool name (`bodyclose/bodyclose`):
  - resources: bodyclose (HTTP response bodies closed; `bodyclose/handled` reports a
    `//bodyclose:handled` directive, which would stop bodyclose checking the function's
    callers), sqlclosecheck (rows and statements closed in a deferred call), rowserrcheck
    (`rows.Err()` checked, for `database/sql` and sqlx), noctx (`http.NewRequestWithContext`,
    `exec.CommandContext`, `QueryContext` and the other context forms of calls that block);
  - errors: errorlint (`errors.Is` and `errors.As` instead of `==`, type assertions and type
    switches, and `%w` for errors in `fmt.Errorf`), nilerr (a branch that checked an error
    returns it), nilnil (no `return nil, nil` for a pointer, map, channel, func or interface; a
    sentinel error instead), errname (error types end in `Error`);
  - contexts: contextcheck (a function with a context passes it on instead of calling one that
    makes a new one; follows calls across the module's packages, not into dependencies),
    containedctx (no context in a struct field), fatcontext (no context derived from itself in a
    loop);
  - types and values: exhaustive (a switch on an enum without a `default` case lists every
    constant), recvcheck (a type's methods all have pointer or all have value receivers, apart
    from `String`, `Error`, `Format`, `Value` and the `Marshal...` methods, which take a value so
    that values and pointers both implement the interface),
    durationcheck (no duration times duration), makezero (no append to a slice made with a
    length), reassign (no assigning another package's `Err...` or `EOF` variables), unconvert (no
    conversion to the type a value already has), wastedassign (no value assigned and then
    assigned again unread);
  - tests: thelper (a test helper starts with `t.Helper()` and takes `t` first), tparallel (a test
    whose subtests call `t.Parallel()` calls it too), usetesting (`t.TempDir()`, `t.Setenv()`,
    `t.Chdir()` and `t.Context()` instead of `os.MkdirTemp`, `os.CreateTemp`, `os.Setenv`,
    `os.Chdir`, `context.Background()` and `context.TODO()`), testifylint (every
    check, printed under its own name such as `testifylint/bool-compare`: the specific
    assertion, `require` for errors, expected before actual, format strings that match their
    arguments, suite methods instead of the package functions);
  - other forms: asciicheck (ASCII identifiers), bidichk (no bidirectional control characters,
    which make code read differently from how it compiles), gocheckcompilerdirectives (every
    `//go:` directive is one the compiler knows), canonicalheader (`http.Header` keys in
    canonical form), musttag (a struct passed to an encoder or decoder has a
    tag on each field, so renaming a field does not change the encoded form; `json`, `xml`, `yaml`, `toml`, `mapstructure` and sqlx `db` calls), perfsprint (no
    `fmt.Sprintf` where `strconv`, `hex.EncodeToString`, `errors.New` or `+` does the same, printed
    under each check's name such as `perfsprint/integer-format`), usestdlibvars (the standard
    library's constants for HTTP methods and statuses, time layouts such as `time.RFC3339`, the
    month in `time.Date` and the RPC paths), sloglint (the `...Context` form when the
    function takes a context or request, typed attributes such as
    `slog.String("name", name)` instead of key-value pairs, `slog.DiscardHandler`), spancheck
    (`span.End()` on every path after `tracer.Start`).

The linters skip generated files (`// Code generated ... DO NOT EDIT.`), as staticcheck does; a
package of only generated files needs no package comment. An analyzer that fails on a package that
builds is a `go/go-lint-failed` tool error, never a silent pass. `//lint:ignore`, `//nolint` and
`//revive:disable` comments do nothing, including the ones nilerr and contextcheck read
themselves, exhaustive's `//exhaustive:ignore` and makezero's `// nozero`, and a
`//bodyclose:handled` directive is a finding of its own: the only way past a finding is an
`exceptions` entry a person accepts.

**Off, with the reason.** Each of these reports the same problem as a check that runs:

| Check                                                                                                                                                           | Reason                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SA1014, SA1017, SA2000, SA2002, SA4018, SA4021, SA5009, SA5010, SA9006                                                                                          | `go vet` reports the same code (unmarshal, sigchanyzer, waitgroup, testinggoroutine, assign, appends, printf, ifaceassert, shift)                       |
| S1029                                                                                                                                                           | SA6003 reports the same loop                                                                                                                            |
| ST1023                                                                                                                                                          | QF1011 reports the same declaration                                                                                                                     |
| SA5005                                                                                                                                                          | never reports on current Go versions; `runtime.AddCleanup` replaces finalizers                                                                          |
| vet `sortslice`                                                                                                                                                 | SA1028 reports the same call                                                                                                                            |
| vet `sqlrowserr`                                                                                                                                                | rowserrcheck reports the same rows, and more (rows read without a loop, sqlx)                                                                           |
| vet `shadow`                                                                                                                                                    | flags the idiomatic `if err := f(); err != nil` inside a function with an outer `err`                                                                   |
| vet `fieldalignment`, `atomicalign`                                                                                                                             | memory layout, not one way to write code; SA1027 covers 32-bit atomics                                                                                  |
| modernize `appendclipped`, `bloop`, `fmtappendf`, `slicesdelete`                                                                                                | left out of the suite upstream (not nil-preserving, or less clear)                                                                                      |
| revive `atomic`, `range-val-in-closure`, `string-of-int`, `waitgroup-by-value`                                                                                  | `go vet` reports the same code (atomic, loopclosure, stringintconv, copylocks)                                                                          |
| revive `constant-logical-expr`, `identical-ifelseif-conditions`, `unconditional-recursion`, `context-keys-type`                                                 | SA4000, SA4014, SA5007 and SA1029 report the same code                                                                                                  |
| revive `dot-imports`, `duplicated-imports`, `error-naming`, `error-return`, `error-strings`, `package-comments`, `receiver-naming`, `time-naming`, `var-naming` | ST1001, ST1019, ST1012, ST1008, ST1005, ST1000, ST1006 and ST1016, ST1011, ST1003                                                                       |
| revive `errorf`, `range`                                                                                                                                        | S1028, S1005                                                                                                                                            |
| revive `unhandled-error`, `unchecked-type-assertion`                                                                                                            | errcheck, with blank assignments and type assertions checked                                                                                            |
| revive `redundant-build-tag`, `use-any`, `use-slices-sort`, `use-waitgroup-go`                                                                                  | modernize `plusbuild`, `any`, `slicessort`, `waitgroupgo`                                                                                               |
| revive `use-errors-new`                                                                                                                                         | `unnecessary-format` reports the same call on every Go version                                                                                          |
| revive `use-slices-concat`                                                                                                                                      | not nil-preserving, the reason modernize leaves out `appendclipped`                                                                                     |
| revive `argument-limit`, `cognitive-complexity`, `cyclomatic`, `file-length-limit`, `function-length`, `line-length-limit`, `max-control-nesting`               | the shared limits measure parameters, statements, lines, nesting, file length and line length, and CRAP covers complexity                               |
| revive `function-result-limit`, `max-public-structs`                                                                                                            | a size limit no other preset has; `confusing-results` covers same-typed results                                                                         |
| revive `banned-characters`, `comments-density`, `file-header`, `imports-blocklist`, `string-format`                                                             | only useful with a project's own list or threshold                                                                                                      |
| revive `add-constant`                                                                                                                                           | flags every numeric literal, so it fires on most correct code                                                                                           |
| revive `confusing-naming`                                                                                                                                       | reports whichever of the two names it reads last, which changes between runs                                                                            |
| revive `modifies-parameter`, `optimize-operands-order`                                                                                                          | report only below revive's 0.8 confidence floor (they cannot tell a parameter from a shadowing variable, or a cheap operand from one with side effects) |
| revive `unsecure-url-scheme`                                                                                                                                    | flags every `http://` string, XML namespaces and documentation links included; transport security belongs to the gosec slice (#976)                     |
| perfsprint `concat-loop`                                                                                                                                        | modernize `stringsbuilder` reports the same loop                                                                                                        |
| perfsprint `error-format`                                                                                                                                       | revive `unnecessary-format` reports the same `fmt.Errorf` call                                                                                          |
| perfsprint `fiximports`                                                                                                                                         | an edit to the import block that goes with the other fixes, not a finding                                                                               |
| sloglint `no-mixed-args`                                                                                                                                        | attributes-only reports every key-value pair, mixed or not                                                                                              |

**Catalog linters considered and left out**, with the reason:

| Linter                                                                                                                    | Reason                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| err113                                                                                                                    | flags every `errors.New` inside a function, though a one-off error nobody compares is fine; its `==` check duplicates errorlint                                                    |
| wrapcheck                                                                                                                 | flags every error returned from another package unwrapped, the module's own included; it needs per-project ignore lists to be usable                                               |
| paralleltest                                                                                                              | requires `t.Parallel()` in every test, which `t.Setenv` and `t.Chdir` forbid and tests with shared fixtures cannot use; tparallel keeps a test and its subtests consistent instead |
| forcetypeassert                                                                                                           | errcheck `-assert` reports the same one-value type assertions                                                                                                                      |
| exhaustive maps and type switches                                                                                         | a lookup map keyed by an enum is often partial on purpose, and a type switch over an interface cannot know every implementation                                                    |
| nilnil `-detect-opposite`                                                                                                 | a value with a non-nil error is the `io.Reader` contract (`n, err`), not a second form                                                                                             |
| predeclared                                                                                                               | revive's `redefines-builtin-id` reports the same names                                                                                                                             |
| sloglint `kv-only`                                                                                                        | flags every `LogAttrs` call, which takes only attributes; attributes-only works with every call and keeps keys and values typed                                                    |
| sloglint other options                                                                                                    | the default logger, constant keys, message style and key case are choices each project makes, and no one form is Go's                                                              |
| spancheck `set-status`, `record-error`                                                                                    | a project that records errors in a helper cannot name it without config, so every such span would be a finding                                                                     |
| usestdlibvars `os-dev-null`, `syslog-priority`                                                                            | deprecated upstream                                                                                                                                                                |
| usestdlibvars `time-month`, `time-weekday`, `crypto-hash`, `sql-isolation-level`, `tls-signature-scheme`, `constant-kind` | they flag a bare word such as `"May"`, `"MD5"`, `"Ed25519"` or `"Int"` in any string, a type-name table or a JWT algorithm label included, where the constant is not meant         |
| sloglint `static-msg`                                                                                                     | flags a constant from another package (`msgs.Started`) and a logging wrapper that passes its message on, with no other form to write                                               |

**Overlaps on one line.** When two checks report the same line, the more specific one stays:

| Kept                                                             | Dropped                                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| SA4011 (break in a switch in a loop)                             | S1023 (redundant break)                                                                   |
| S1037 (elaborate sleep)                                          | S1000 (single-case select)                                                                |
| SA4010 (append result unused)                                    | SA4006 (value never used)                                                                 |
| SA4031, SA5000                                                   | vet `nilness`                                                                             |
| SA5001, SA9001 (defer Close)                                     | errcheck                                                                                  |
| S1018 (sliding copy loop)                                        | modernize `rangeint`                                                                      |
| vet `gofixdirective`                                             | vet `inline` on the same directive                                                        |
| `go vet` printf                                                  | SA1006 (Go 1.24 and later modules)                                                        |
| S1002                                                            | revive `bool-literal-in-expr` at the same column                                          |
| SA5008, `go vet` structtag                                       | revive `struct-tag`                                                                       |
| SA5003, SA9001, SA9010                                           | revive `defer`                                                                            |
| SA5002, SA9003                                                   | revive `empty-block`                                                                      |
| ST1015                                                           | revive `enforce-switch-style`                                                             |
| SA4005                                                           | revive `modifies-value-receiver`                                                          |
| QF1009                                                           | revive `time-equal`                                                                       |
| S1039                                                            | revive `unnecessary-format`                                                               |
| S1023, SA4011                                                    | revive `unnecessary-stmt`, `useless-break`                                                |
| QF1011                                                           | revive `var-declaration` at the same column                                               |
| nilerr                                                           | nilnil on `return nil, nil`                                                               |
| sqlclosecheck (Close not deferred)                               | errcheck                                                                                  |
| ST1012 (sentinel error names)                                    | errname                                                                                   |
| SA1005 (`exec.Command` shell line)                               | noctx                                                                                     |
| SA4006, SA4010                                                   | wastedassign                                                                              |
| modernize `testingcontext`                                       | usetesting                                                                                |
| errorlint                                                        | testifylint `compares`                                                                    |
| thelper                                                          | testifylint `suite-thelper`                                                               |
| SA1006, QF1010, S1025, S1028, S1039, revive `unnecessary-format` | perfsprint `string-format`                                                                |
| QF1012 (`fmt.Fprintf` to a writer)                               | perfsprint `string-format`, `integer-format`, `error-format`, `bool-format`, `hex-format` |
| SA9009 (space in a directive)                                    | gocheckcompilerdirectives                                                                 |
| ST1013 (HTTP status constants)                                   | usestdlibvars                                                                             |
| ST1018 (format characters in text)                               | bidichk                                                                                   |
| contextcheck                                                     | `go-rules/context-outside-entry`                                                          |
| `go-rules/http-without-timeout`                                  | noctx                                                                                     |

Those two compare the column too, because one line can hold a second, different problem (`found ==
true || ready && false`). revive keeps the rules staticcheck lacks in the same areas:
`bool-literal-in-expr` also flags `found && true`, `empty-block` an empty `switch`, `useless-break`
a `break` that ends a `select` case, `modifies-value-receiver` a changed receiver that is read
again, and `defer` a deferred call chain.

**Project config.** `staticcheck.conf` files are read only when the project opts in with
`"tools": { "staticcheck": { "precedence": ["project"] } }`. Then each package's merged
configuration decides which checks report there (its `checks` list, as staticcheck reads it) and
its initialisms, dot-import and status-code lists apply, and every `staticcheck.conf` in the
repository counts as policy, so editing one is a policy change a person accepts. A file that does
not parse is a `go/go-lint-failed` tool error that names it. revive has no project file it finds
on its own (its command line reads a `-config` path or the user's home config), so nitpicker reads
none and the settings above are fixed.

**Fixtures.** `languages/go/lint/fixtures` holds, for every check that runs, a file with a line
that fails (marked `// want <check>`) and the allowed form, which must pass every check. The lint
program's Go test fails when a marked line is not reported, when any other line is, or when a
check has no fixture. `fixtures/legacy` (Go 1.14) and `fixtures/next` (Go 1.27) hold the checks
that apply only before or after a Go version. A revive rule must be either in the list that runs
or in the off list of the lint program's tests, so a revive upgrade that adds a rule fails until
someone decides it.

## Own rules

nitpicker's own analyzers run in the lint program as the `go-rules` tool, for the forms no linter
above settles. Each message names the allowed form and ends with its exception entry. They follow
the project's choices and never flag them: `testing` or testify assertions, the logger (`log/slog`,
zap, zerolog, logrus, go-kit log, klog, logr, hclog, charmbracelet log and apex log are
recognised by package), table-driven or separate tests, and the
`cmd/`, `internal/`, `pkg/` layout.

| Rule                            | Reports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Allowed form                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `panic-for-failure`             | `panic` in a non-test file outside `main` (in package main), `init`, a `default` clause and functions named `Must` or `MustX` (also `must`, `mustX`); re-panicking a `recover()` value, wrapped or not, is allowed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | return an error                                                                                                                                          |
| `logged-and-returned`           | in a non-test file, a logger call that takes a local error variable, followed in the same block by a `return` of that error (as is or wrapped) with no assignment to it, `return` or `break` in between                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | return it wrapped with `%w` and log it where it is handled, or log it and handle it                                                                      |
| `unowned-goroutine`             | a `go` statement (in test files too, where it is a goroutine the test leaves behind) whose function neither takes nor uses a `sync.WaitGroup`, errgroup, channel or `context.Context`, directly, through its receiver's fields or in the body of the function it calls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `wg.Go(...)`, an errgroup's `Go`, or a context the caller cancels or a channel the caller reads                                                          |
| `context-outside-entry`         | `context.Background()` or `context.TODO()` in a non-test file of a package other than `main`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | take `ctx context.Context` first and pass it on                                                                                                          |
| `sleep-to-wait`                 | `time.Sleep` in a non-test function that started a goroutine (`go`, `wg.Go`, an errgroup's `Go`) on a path that reaches it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | wait on the WaitGroup, errgroup, channel or context                                                                                                      |
| `mutable-package-state`         | a package-level variable declared in a non-test file that non-test code outside `init` changes: assigns (also as a `range` target), increments, writes through (`cache[key] = value`, `config.Mode = ...`), `delete`s, `clear`s or `copy`s into, takes the address of, or calls a method on when it is a `sync.Once` or `sync.WaitGroup`; reported once, at the declaration. A swap in a test, `init` assignments, atomic values, `sync.Map`, `sync.Pool` and a mutex do not count (the state a mutex guards is reported itself)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | keep the state in a value the caller creates and passes in; `sync.OnceValue` for a lazy value                                                            |
| `init-side-effect`              | each statement of a `func init()` in a non-test file that calls something for its effect, starts a goroutine (which `unowned-goroutine` may report too), defers or sends, inside branches and loops too; a call to a `Register...` or `MustRegister...` function (a driver or format registry) and assignments are not reported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | a setup function that `main` or a constructor calls; initialize variables in their declaration                                                           |
| `lone-interface`                | an interface declared in a non-test file that a function of the package returns as its named type, with exactly one implementation among the package's non-test types (a generic type counts when it has the methods); implementations in other packages are not visible, and interfaces that are sealed (an unexported method, or a method on an unexported type of the package, as functional options are), constraints and interfaces with no methods are not reported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | return the concrete type and declare the interface where it is consumed                                                                                  |
| `any-in-exported-signature`     | in a non-test file, an exported function, or an exported method of an exported type, that returns `any` (generic functions too), or whose `any` parameter it asserts or type-switches to a concrete type; variadic `...any`, parameters passed on untouched or only checked for an interface, and methods whose type implements an interface (declared in the package's imports) that has the method are not reported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | the concrete type, or a type parameter with a constraint                                                                                                 |
| `generic-package-name`          | a package named `helper`, `helpers`, `utility`, `commons`, `manager` or `managers`, reported on its folder (from the first hand-written non-test file); a package of only test or generated files is not reported. revive `package-naming` reports `util`, `utils`, `common`, `misc`, `interfaces` and `types`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | a package named for what it provides                                                                                                                     |
| `get-prefixed-getter`           | an exported method `GetX()` (not `GetOrX`) of an exported type, with no parameters and one result, whose type implements no interface (declared in the package's imports) that has the method                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `X()`                                                                                                                                                    |
| `http-without-timeout`          | in a non-test file, `http.Get`, `http.Post`, `http.Head`, `http.PostForm`, a use of `http.DefaultClient` (comparing it or assigning it or its `Timeout` is not a use), and an `http.Client` built as a literal, with `new` or as a zero `var` without a non-zero `Timeout`, unless the same function sets `Timeout` on the variable or field it was assigned to. A `Transport` with its own timeouts still leaves reading the body unbounded, so it does not count. Go's top-level `http.Get` cannot take a context, so there is no per-call form as in the TypeScript preset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `&http.Client{Timeout: 10 * time.Second}`, built once and passed in                                                                                      |
| `io-in-loop`                    | in a non-test file, a `database/sql` (`DB`, `Tx`, `Conn`), pgx (`Conn`, `Tx`, `Pool`, also pgxpool), sqlx (`DB`, `Tx`, `Conn`), gorm (`DB`) or `net/http` client call in a `range` over a slice or map, a `range len(x)`, or a `for` whose condition compares with `len(x)`, also inside a function literal run in the loop. Not reported: a call in a goroutine or a `Go(...)` task (errgroup, WaitGroup), a prepared `sql.Stmt` (the database/sql bulk form), ranges over an array, a composite literal or a package-level variable (fixed lists such as migrations), over a count or a channel, and a call the loop leaves after (`return` or `break` right after it, or `if err == nil { return ... }`: first success, failover). A local slice literal is still reported.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | one batch call (`WHERE id = ANY($1)`, `IN (...)`, `COPY`, `pgx.Batch`, a bulk endpoint), or the calls run concurrently under an errgroup with `SetLimit` |
| `swallowed-error`               | in a non-test function that does not return an `error`, an `if err != nil` (any error, not an `errors.Is` or `errors.As` check) whose body only logs (a logger call that does not exit, `fmt.Print`, or `fmt.Fprint` to `os.Stdout` or `os.Stderr`), `continue`s, assigns literals or returns nothing or literals (`return false`, `return 0`, `return ""`, `return nil`). A named constant (`return defaultPort`), any other call and a `return` in a function that returns an `error` (nilerr's case) are handling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `repeated-string-literal`       | the third and later uses in a non-test file of a string literal of 5 or more characters with a letter or digit. Not counted: constant declarations, imports, struct tags, `case` values, map and struct keys, index keys (`m["key"]`), the value of a `type`, `kind`, `tag` or `variant` key, log attribute keys, the first argument of a translation call (`T`, `Translate`, `Localize`...), format templates (a `%` verb), MIME types, HTTP methods, encodings and time layouts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `generic-name`                  | a type or a file (its name without `.go` and a `GOOS` or `GOARCH` suffix) in a non-test file whose last word is `util`, `utils`, `utility`, `utilities`, `helper`, `helpers`, `manager`, `managers`, `common`, `commons`, `misc` or `miscellaneous` (a trailing `Funcs`, `Methods`, `Base` and the like is dropped first, and version words are ignored). `ContextManager`, a manager of an `Authentication`, `Transaction`, `Cache`, `Entity`, `Session`, `Connection`, `Lock` or `Resource`, a type that embeds or is defined from a type with the same last word, and a file named like its package are not reported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `todo-without-issue`            | a `TODO`, `FIXME`, `XXX` or `HACK` at the start of a comment line, or followed by `:` or `(`, with no issue reference right after it (`TODO(#123)`, `TODO: PROJ-123`, a URL); test files too. go-critic `todoCommentWithoutDetail` gives way to it on the same line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `forwarding-method-alias`       | a method in a non-test file whose only statement calls another method of the same type, on the same receiver, with all of its parameters in order, and returns the result unchanged, with the same signature; methods without parameters and methods an interface of the package or its imports asks for (`Write` forwarding to `write` for `io.Writer`) are not reported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `hardcoded-secret`              | in a non-test file, a string literal (also concatenated, converted to `[]byte` or a `cmp.Or` fallback) assigned to a secret name (`password`, `token`, `apiKey`, `signingKey`... the shared definition in `shared/naming/secret-words.mjs`, mirrored in `rules/secrets/spec.go`) in a declaration, an assignment, a struct or map literal, `os.Setenv`, `flag.String`, a `SetDefault` call or a function that only returns it, when the text looks like a secret (letters and digits, or three kinds of characters) and is not a placeholder, a URL or a name. gosec `G101` gives way to it on the same line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `credential-shape`              | a string literal in a non-test file shaped like a real credential: an AWS access key, a GitHub, Slack, Stripe or OpenAI token, a private-key block, or a password inside a URL or an `Authorization` value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `secret-in-log`                 | in a non-test file, a logger call, `fmt.Print`, `fmt.Fprint` to `os.Stdout` or `os.Stderr`, `fmt.Errorf`, `errors.New` or `panic` that is given a secret-named string, byte slice, struct or map (a variable, a field, `os.Getenv("API_TOKEN")` or a log attribute such as `slog.String("token", value)`), also inside `fmt.Sprintf`, concatenation and composite literals. Constants and status names (`hasToken`, `isSecret`) are not reported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `unindexed-foreign-key`         | in a non-test file, a GORM model's (a struct with a `gorm` tag or an embedded `gorm.Model`, or with an `ID` or `primaryKey` field in a package that imports GORM) foreign-key field (a belongs-to key, or the key a has-one or has-many relation reads, found as GORM finds it: `foreignKey`, then `<Field>ID` or `<Model>ID`) that is not the first field of a `primaryKey`, has no `unique` and leads no `index` or `uniqueIndex` (lowest `priority` first; one with `where` or `expression` does not count); and an ent edge that holds a foreign key (a `Unique` edge whose other side is not, or a unique `edge.To` with no inverse) that no `index.Edges`, `index.Fields` on its `Field`, unique field first `field.ID` column, or first column of the unique index ent adds to a `Through` edge schema leads, or an `edge.To` without an inverse, whose key sits on a schema with no edge to index it by. Not reported: many-to-many, polymorphic and `constraint:-` relations, ent one-to-one edges, ent schemas whose edges, indexes or mixins cannot be read (a non-constant name, a mixin with its own edges or indexes, or one returned by a function), schemas `entsql` skips, modules whose migrations or sqlc schema files (under the module's folder) declare foreign keys (`foreign-key-index` checks those), MySQL-only modules, and modules whose non-test code (outside `testdata`) sets `DisableForeignKeyConstraintWhenMigrating` or `IgnoreRelationshipsWhenMigrating` to `true` or migrates with `WithForeignKeys(false)` | `gorm:"index"` on the key field; `index.Edges("owner")` in the ent schema's `Indexes()`                                                                  |
| `test-without-assertion`        | a `Test` function, or a testify suite method `TestX`, that never fails on its own: no `t.Error*`, `t.Fatal*`, `t.Fail*` or `t.Skip*` call, no testify `assert`/`require` call (or one of another `assert` or `require` package whose functions take a `TestingT`), no gomega `Expect` or `Eventually`, no call that is handed a `*testing.T` (a helper, `suite.Run`, a subtest function passed by name to `t.Run`) and, in a suite, no call to a method of the suite's own type. Subtests count toward their test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `conditional-assertion-in-test` | in a test, a subtest or a function of the same test file that a test calls: the first assertion inside an `if` whose body does not call `t.Error`, `t.Fatal` or `t.Fail` directly (`if resp != nil { if resp.Code != 200 { t.Error(...) } }`, `if resp != nil { assert.Equal(...) }`), when neither its condition (`if assert.NotNil(t, resp)`), its `else` nor a later statement asserts; the same for a `switch` or `select` clause, when a clause or a missing `default` leaves a path without an assertion; and the first assertion in a loop (also in a subtest or closure in the loop). `if got != want { t.Errorf(...) }` and a `switch` of such checks are assertions, not conditions. Loops that cannot run zero times are fine: a `for` with no condition or whose constant start passes its constant bound (`i := 0; i < 3`, `i := 3; i > 0`), a `range` over a positive constant, and a `range` over a non-empty literal table (a composite literal, or a variable set to one and never assigned again) whose assertions all run in `t.Run` subtests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `skipped-test-without-reason`   | in a test file, `t.Skip()`, `t.SkipNow()` or a skip with an empty string, on a `*testing.T`, `B`, `F` or `testing.TB`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `switched-off-test`             | a skip at the top level of a test or subtest (also inside `if true` or `if` on a boolean constant of the project), so the test always skips; a skip under a real condition (`if testing.Short()`) is fine. It replaces `skipped-test-without-reason` on the same line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `sleep-in-test`                 | `time.Sleep` or a bare `<-time.After(d)` statement with a non-zero delay, directly in a test, a subtest or a function of the same test file that a test calls and hands a `*testing.T`; a sleep in a goroutine, a fake's method, a handler or another function literal, and anything inside a `testing/synctest` bubble, where time is virtual, is not reported. A `<-time.After` that is a `select` case is a timeout, not a sleep                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

`unindexed-foreign-key` is the Go counterpart of the TypeScript `nitpicker/no-unindexed-foreign-key`,
the Python `unindexed-foreign-key` and the Java and Kotlin `JpaUnindexedForeignKey`: only MySQL
indexes a foreign-key column by itself. sqlc projects declare their tables in SQL, which the
`foreign-key-index` repository check reads.

Left to linters, so not rebuilt here (gosec comes with GO2's next part, #976): `%w` and
`errors.Is`/`errors.As` (errorlint, SA1032, `deepequalerrors`), contexts in structs and contexts as the first parameter
(containedctx, revive `context-as-argument`), `defer` in a loop (revive `defer`, SA9001), naked
returns (revive `bare-return`), mixed receivers (recvcheck) and string-built SQL (gosec). Of the
guards every preset shares (GO6, #419), unused parameters (revive `unused-parameter`), boolean flag
parameters (revive `flag-parameter`; Go has no keyword-only parameters, so the allowed form is two
functions or a named type), commented-out code (go-critic `commentedOutCode`, #1003), discarded
errors (errcheck with `blank`), empty error checks (revive `empty-block`) and `return nil` after an
error check (nilerr) are left to the linters too, and so are temporary files a test leaves behind
(usetesting asks for `t.TempDir()`).

**Fixtures.** `languages/go/lint/fixtures/go-rules` holds a failing and an allowed form for each
rule, checked like the linters' fixtures. A linter fixture whose code an own rule also reports
carries both rules on its `// want` line. `fixtures/stubs` holds minimal stand-ins for zap, zerolog,
errgroup, pgx, GORM and ent, so the fixtures build without downloads.

## Facts

The metrics program writes, per `.go` file, its top-level functions, types, constants and variables
(methods are not listed) and the names the file uses: names defined in another file of the same
package, `alias.Name` selectors into packages of the same module (an import of the module path or a
path below it), dot imports, and names a file defines and uses itself. From these the adapter builds
the shared facts (`shared/rules/facts/`, see "Facts schema" in [internals](internals.md)), so the
fact rules the other presets run reach Go with the same definitions. Names are resolved without type
information: a local variable that shadows a package-level name is seen as local, and a struct key
in a composite literal (`Item{Name: name}`) counts as a use of a package-level `Name` if there is
one, which can only hide a finding.

**Published packages.** A package's exported API counts as used, and tests count as its callers,
when other modules can import it: the module path can be fetched (its first element has a dot, such
as `github.com/...` or `example.com/...`), the package is not `main`, and no element of its import
path is `internal`. A module named `shop` or code under `internal/` is judged in full.

**`test-only-export`.** An exported top-level name of a package that is not published, which only
`_test.go` files use, fails. Go compiles a package's files together and has no file-level import, so
a whole file is never judged, only its declarations. A function marked `//export` (cgo) or
`//go:linkname` is an entry point. Unexported test-only code is left to `deadcode`.

**Copies across packages.** The packages of a module count as one package, as Python's modules do:
outside build-constrained files, two files cannot define one top-level name in the same Go package,
so a copy sits in another package. `duplicate-definition` fails a used top-level function with the
same name and the same code in two files (one too small for the duplicate scan below), and asks to
keep one in a package and import it. `sibling-copy-edit` fails a function of 20 tokens or more that
a change edits away from its unedited copy in another package (at least 80% the same tokens before
and after): edit both, or move them into one. Types and constants are not compared, since packages
often declare their own small type or constant of one name. Files with a build constraint
(`//go:build`, `_linux.go`) are left out: they are platform variants of one function, not copies.
`exported-name-collision` does not apply: Go code names another package's export through the
package (`billing.Total`), so two exports with one name never meet unqualified, and a file that dot
imports two packages exporting one name does not compile.

**`doc-comment-content`.** A doc comment on a top-level function, method, type, constant or
variable, or on a struct field or interface method, fails when it only restates its name
(`// Close closes.`) or its prose runs past 5 lines. The text is read with `go/doc/comment`:
directives (`//go:generate`, `//export`, `//nolint:...`) are not part of it, list items and
headings count as prose, and an indented code block or a `Deprecated:` paragraph is not counted
and says more, so a comment with one is never reported as restating its name. `_test.go` and
generated files are not read, and neither is the package comment. The exception takes it as
printed, `facts/doc-comment-content`.

## Duplicates

jscpd's `go` format runs over the module's non-test, non-generated files, and the renamed-clone pass
runs it again over a copy with names, strings, runes and numbers normalized, as in the other
presets: a clone of at least 100 tokens fails even when every name was changed. Import blocks,
composite literals that hold only data, and code that only repeats Go boilerplate (struct fields,
`if err != nil {`, `return nil, err`, constructors that assign fields, getters) do not count.
`_test.go` files never count. Folders the go tool skips (`testdata`, `vendor`, names that start
with `.` or `_`, nested modules) are always skipped, and `duplicates.skippedFolders` (default
`testdata` and `vendor`) names more. A
project's `.jscpd.json` applies with `"tools": { "jscpd": { "precedence": ["project"] } }`.

## Coupling and features

`stability-direction` runs on the package graph: one unit per package folder, an edge for each
import of another package of the module by a non-test file. Every file counts whatever its build
constraints, because a dependency in `poll_windows.go` is still a dependency of the package. A
package that depends on a less stable package fails, on its `doc.go` (else its first file that is not generated), and the
message suggests an interface the stable package owns.

`layout.featureRoots` and `layout.sharedRoots` (defaults `**/features` and `**/shared`) feed
`shared-used-by-one-feature`: a file under a shared root that only one feature uses, directly or
through other shared code, fails. A blank import (`import _ ".../shared/drivers"`) counts as a use
of every file of the package. The compiler already enforces `internal/` visibility and rejects
import cycles, so the preset has no rule for either.

## Dead code

`deadcode` (golang.org/x/tools) runs when the module has a `main` package, with `go.buildTags`. Each
function no `main` package of the module reaches is a `deadcode/unreachable-func` finding; calls from
tests do not count. It is dropped when:

- the function is exported and its package is published (another module may call it);
- `test-only-export` already reports it;
- it is marked `//export` (cgo) or `//go:linkname`;
- staticcheck already reports it as U1000 (unused code);
- its file has build constraints (`//go:build`, or a `_linux.go`-style name), or a file with build
  constraints uses it: `deadcode` sees one platform and set of tags, and that code may be live on
  another.

A module without a `main` package is a library: its exported API is its entry point and `deadcode`
does not run. A folder's package is named after its files without build constraints, so a
`//go:build ignore` generator in `package main` does not turn a library folder into a `main` package. A method only a constrained file calls can still be reported; add an exception for it.
`deadcode` runs only when the code compiles.

## Module requirements

`go mod tidy -diff` (Go 1.23 or later) compares `go.mod` with what the module's packages import. A
`require` it would remove is `dependencies/unused-dependency` on its `go.mod` line, and a direct
`require` it would add is `dependencies/unlisted-dependency`; both name `go mod tidy` as the fix.
A change of only the `// indirect` marker, of the `go` line or of `go.sum` is not a finding.
`unresolved-import` does not apply to Go: the compiler rejects an import no package provides, which
is a `build/compile-error`. When `go mod tidy` fails without printing a diff (for example when it
cannot reach the module proxy, or Go is older than 1.23), the snapshot is a `go/go-mod-tidy-failed`
tool error and, as with any step that fails, holds no other findings.

## Exceptions

The top-level `exceptions` take a finding as it is printed, `<tool>/<rule>` (`vet/printf`,
`deadcode/unreachable-func`), as in the Java preset, plus the shared rules (the function, type, file
and folder limits, `slow-test`, `duplicate-clone`, `stability-direction`, the fact rules,
`unused-dependency`, `unlisted-dependency`, the repository checks, and `changed-branch-coverage`,
`crap-score-limit`, `crap-coverage-unknown`, `mutant-survived` and `mutant-nocoverage` with the
`function` they name). Every vet, staticcheck, errcheck, modernize, revive, deadcode, catalog linter,
go-rules, limit, coverage, CRAP, mutation and slow-test message ends with its exception entry, for
example `{"rule":"vet/printf","paths":["shop/label.go"],"reason":"..."}`. Format findings,
compile errors and `no-tests-ran` have no exception route: run the formatter, fix the build, or
add a test.

## Config keys

| Key                                                      | Meaning                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `go.formatters`                                          | `gofmt`, `gofumpt` and/or `goimports`; pins the format check |
| `go.buildTags`                                           | build tags passed as `-tags` to vet and the tests            |
| `tools.gofumpt.precedence`, `tools.goimports.precedence` | read the formatter's options from the golangci-lint config   |
| `tools.staticcheck.precedence`                           | read the project's `staticcheck.conf` files                  |
| `tools.jscpd.precedence`                                 | read the project's `.jscpd.json` for the duplicate scan      |
| `layout.featureRoots`, `layout.sharedRoots`              | the feature layout `shared-used-by-one-feature` reads        |
| `testConsole.allow`                                      | test output messages `test-console-output` accepts           |
| `duplicates.skippedFolders`                              | folder names the duplicate scan skips                        |
| `thresholds`, `exclude`, `exceptions`, `legacyInventory` | shared with every preset                                     |

`react` and `i18n` (TypeScript only) and the other `layout` keys (Go packages follow the module, so
there are no source roots to set) are config errors with `"preset": "go"`, each naming its reason.

## Tests of the preset

- Unit tests next to the adapters (`languages/go/adapters/**.test.mjs`), the metrics program's
  own Go tests (`languages/go/inspect/inspect_test.go`, `languages/go/inspect/mutants/`) and the
  lint program's fixture tests (`languages/go/lint/lint_test.go`).
- End-to-end suites in `languages/go/adapters/e2e/`, run with `npm run test:go` (they need Go on the
  `PATH` and skip without `NITPICKER_GO_E2E=1`). They build throwaway git repositories and run
  the real CLI on them: a clean change, gofmt, vet, a compile error, a nested function next to an
  untouched legacy one, exceptions, failing and slow tests, build tags, gofumpt from a golangci-lint
  file, a change that adopts gofumpt, a missing toolchain, the linters' findings and messages, a
  `staticcheck.conf` that is ignored until the project opts in; on an application module, a
  renamed copy, an exported function only tests call, an unexported function only tests call, and
  an unused function reported once; a branch outcome no test takes, a tested change next to an
  untested legacy function, a branch exception, an untested branchy function's CRAP score, a
  surviving mutant on a changed line, a change whose tests kill every mutant, a test change that
  lets a mutant the base caught survive, and mutants skipped because their tests fail; and a new
  data race, a race the merge base already had, and cgo turned off. CI runs them in the `go-e2e`
  workflow.

## Remaining slices

| #   | Slice                                           | Scope                                                                                                                                                                                                                       |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GO1 | Base (#414)                                     | This document: done.                                                                                                                                                                                                        |
| GO2 | Linters (#415)                                  | Parts 1 and 2 done: staticcheck, errcheck, modernize, the extra `golang.org/x/tools` passes and revive (see [Linters](#linters)). Next: gosec and the permissively licensed `go/analysis` linters, in the same program.     |
| GO3 | One-way rules (#416)                            | Done: errors, concurrency, package state, design, HTTP timeouts and I/O in loops (see [Own rules](#own-rules)).                                                                                                             |
| GO4 | Coverage, CRAP and mutation (#417)              | Done (this document).                                                                                                                                                                                                       |
| GO5 | Duplicates, coupling, dead code, modules (#418) | Done: see [Facts](#facts) through [Module requirements](#module-requirements).                                                                                                                                              |
| GO6 | Shared guards and test honesty (#419)           | Done: `duplicate-definition`, `sibling-copy-edit` and `doc-comment-content` (see [Facts](#facts)), `test-console-output` (see [Tests](#tests)), the source guards and the test-honesty rules (see [Own rules](#own-rules)). |
| GO7 | Race detector (#433)                            | This document: done.                                                                                                                                                                                                        |

## Known limits

- One module per run: the module at the project root. A nested module (its own `go.mod`) and a
  `go.work` workspace's other modules are not analyzed.
- Generated files are listed but not measured, format-checked, linted or duplicate-scanned; they
  still compile and vet, and the names they use count as uses.
- The feature boundary rules other than `shared-used-by-one-feature` are not run for Go yet.
- Mutants run one after another, each a `go test` of its test packages, so mutation testing costs
  roughly one test run of those packages per mutant on the changed lines. Go's build cache keeps the
  unchanged packages compiled.
- A weakened test is found only in its own folder: a test that tests another package through its
  API (a black-box test in another folder) does not get that package mutated whole.
- A branch point under a `//line` directive that moves it to another line or file is not measured,
  because its profile blocks name the directive's position.
- Branch and CRAP findings are keyed by their file and function. Moving a function to another file,
  or turning it into a method, makes its legacy findings new.
- The tools are built from the Go module proxy on first use, so the first run needs network access
  (or a `GOPROXY` the project sets) and takes longer. The lint program needs Go 1.27, so a project
  on an older toolchain downloads it once with `GOTOOLCHAIN=auto`.
- The linters type-check for the host's `GOOS` and `GOARCH`, so unconvert can report a conversion
  that is needed on another platform (a `syscall.Stat_t` field that is `int64` on linux/amd64 but
  not on 32-bit targets); such a file takes an `exceptions` entry.
- tparallel asks a test whose subtests call `t.Parallel()` to call it too, which a test that
  uses `t.Setenv` or `t.Chdir` cannot do; such a test makes its subtests serial or takes an
  `exceptions` entry.
- The linters run on the whole module for both snapshots; a finding is new when its message and
  line text are new, as for vet.
- The race detector finds only the races the tests exercise, on the interleavings that happen in
  that run. A race the merge base has but its run did not hit shows as new on head. A base whose
  tests failed treats head's races outside the changed lines as unknown on the base, as it does
  coverage and slow tests.
- A race is keyed by its functions and reported on the file of its first access, so moving one of
  the racing functions to another file or package makes the race new.
