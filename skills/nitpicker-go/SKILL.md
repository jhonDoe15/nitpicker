---
name: nitpicker-go
description: Use before writing or changing Go code in a project that runs nitpicker with the go preset, so the code follows nitpicker's one allowed style and passes `npx nitpicker` on the first run.
---

# nitpicker for Go

Written for nitpicker 0.1.0-rc.2. If `npx nitpicker --version` prints another version, reinstall
this skill with the command `npx nitpicker init` prints.

nitpicker allows one way to write each construct. Write it that way from the start; the gate is a
backstop. It fails only on findings your change adds, so leave code the task doesn't need alone.

If your change edits a function, type, file or package that existed before it, read
[editing-existing-code.md](editing-existing-code.md) before you edit.

## Check one file or folder

To look at one file or folder, for example before you change it, pass its path: `npx nitpicker --all
internal/orders` lists every finding in it, and `npx nitpicker internal/orders/order.go` gates only
your change to that file. Paths are read from the current folder. The analysis still covers the
whole project, so it takes as long as a full run; finish with the plain run below.

## Finish with the gate

`--analyzer <name>` runs one analyzer only, which is faster still. A run narrowed with `--quick` or
`--analyzer` is never a pass: finish with the full run below, without them.

1. Run the project's tests: `go test ./...` (with the build tags the project's
   `nitpicker.config.json` lists under `go.buildTags`, as `-tags=...`). Failing tests are a tool
   error that names them.
2. When the change is complete, run `npx nitpicker --fix` as a background command you wait on,
   without a pipe: you need its exit code. Wait for it: do not start a second run or kill it. It
   first formats the changed `.go` files with the formatter the project already uses (gofmt, gofumpt
   or goimports; never switch it) and lists the rewritten ones under "Fixed files:"; re-read those
   files before you edit them again. A file that was unformatted before your change is left as it
   is: format the lines you changed there with the command the finding prints. Then it runs
   `go vet`, `go test` and its own checks on the merge base and on head with the Go toolchain on the
   `PATH`. It takes minutes and prints a progress line for each slow analyzer.
3. Act on the exit code:
   - 0: done, unless you narrowed the run with `--analyzer`: the summary then says `Ran only: ...`
     or names the skipped checks, and you run the gate again without them before you finish.
   - 1: fix the failing tests the summary leads with, every new finding (printed as
     `<tool>/<rule> <path>:<line>`) and any tool error listed below them. Then rerun.
   - 2: no new findings, but a tool failed. Fix the cause it names (usually a module that does not
     load, or Go missing from the `PATH`) and rerun. Exit 2 is never a pass. If it says another run
     is in progress, wait for that run; never kill it. When the message links to
     [troubleshooting](https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md),
     the fix is there.

   If the console output is cut off, read `reports/quality/diff/report.txt`, then
   `new-findings.json` and `tool-errors.json` in the same folder.

   A note such as `Note: 1 existing lint finding in edited code (not failing, no more than before)`
   or a "Touched, still over limit" list names held findings in code you edited. It never fails the
   run: leave that code alone.

4. Never suppress: no `//nolint`, `//lint:ignore`, build tags that hide a file from the checks,
   config `exclude`/`exceptions`, legacy entries, or weakened tests (`t.Skip` added to get past a
   failure). If a finding seems wrong, stop and ask. Never pass `--accept-policy-change`, set
   `NITPICKER_ACCEPT_POLICY_CHANGE` or add the `accept-policy-change` label: a
   `nitpicker-config/policy-loosened` finding is for a person to accept.
5. Code that is right despite a rule: a finding message may end with the `exceptions` entry that
   would accept it (`If this is intended, add {...} to "exceptions" in nitpicker.config.json.`).
   That entry is for a human reviewer. Never add one, and never fill in its `reason`, to get past
   the gate: stop and ask a human, and quote the finding with its entry.

Before you change code other packages use, or fix a bug, read
[beyond-the-gate.md](beyond-the-gate.md). Why each rule is here: [SOURCES.md](SOURCES.md).

The linters' allowed forms (errors, names and doc comments, simplifications, modern forms): read
[rules/linters.md](rules/linters.md) before you write Go. nitpicker's own rules (panics, logged and
swallowed errors, goroutine owners, root contexts, sleeps, package state, interfaces, `any`, names,
HTTP timeouts, I/O in loops, repeated strings, task markers, method aliases, secrets, test honesty):
read [rules/own-rules.md](rules/own-rules.md).

To learn why a rule is on and what form it allows before you write or change code, run
`npx nitpicker explain <tool/rule>` with the name a finding prints, or read the
[rule reference](https://github.com/jhonDoe15/nitpicker/blob/latest/docs/rules/README.md).
`npx nitpicker rules` lists the rules of this project's preset.

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
- A migration or sqlc schema file that adds a foreign key also creates an index that starts with
  its columns (`CREATE INDEX ON orders (customer_id)`); PostgreSQL does not create one
  (`foreign-key-index`). Without migrations, a GORM foreign-key field gets `gorm:"index"` and an
  ent edge that holds the key gets `index.Edges("owner")` (`go-rules/unindexed-foreign-key`).

## Reuse, packages and dead code

- Don't copy a function and rename its variables: a renamed copy of 100 tokens or more fails
  (`duplicates/duplicate-clone`). Call the existing code, or move it to a shared package both use.
  A smaller function copied into a second package fails too
  (`duplicate-definition`), and so does editing one of two copies away from the other
  (`sibling-copy-edit`): keep one copy, exported from one package.
- A doc comment says what the name does not: `// Close closes.` restates it
  (`doc-comment-content`); say what the caller must know (`// Close flushes pending writes and
releases the file; calling it twice returns an error.`). Keep the prose to 5 lines; put an
  example in an indented code block and a replacement in a `Deprecated:` paragraph.
- Code exists for production callers. An exported name that only `_test.go` files use fails
  (`test-only-export`), and in a module with a `main` package so does a function no `main`
  reaches (`deadcode/unreachable-func`): delete it, or call it from production code. A test helper
  lives in a `_test.go` file. The exported API of a package other modules can import (not under
  `internal/`, in a module whose path has a domain) counts as used.
- A test runs the code it tests: a `_test.go` file that reaches no non-test file of the module,
  directly or through its helpers, fails (`no-production-runtime`). Test the package's own code, or
  move a pure stub check out of the suite.
- Every optional input is used: an exported field of an `...Options` struct an exported function
  takes, or an exported `With...` functional option, that no code of the module sets fails
  (`unused-option`). Delete the option, or set it where a caller needs it.
- When a package re-exports a subpackage's type (`type Order = orders.Order`), import it from that
  package (`shop.Order`), not from `shop/orders` (`public-alternative-bypass`); `main` may import
  either.
- A package depends on packages more stable than itself (`stability-direction`): when a widely used
  package needs a detail from a narrower one, define an interface in the widely used package and
  let the narrower one implement it.
- Code under a `shared` folder is used by more than one feature (`shared-used-by-one-feature`);
  code only one feature uses lives in that feature. Other code uses only the package directly in a
  feature folder, never its sub-packages (`feature-internal-import`); `shared` never uses a feature
  (`shared-imports-feature`); features never depend on each other in a cycle (`feature-cycle`).
- A package under a `domain` folder imports no adapter package, `os`, `net`, database, HTTP or
  messaging client, logger or random source, and calls no id generator such as `uuid.New`
  (`domain-imports-*`): declare an interface (a port) in the domain, implement it in an adapter,
  and pass ids, times and random values in. Value types such as `uuid.UUID`, `net.IP` and
  `sql.ErrNoRows` are fine.
- `go.mod` requires exactly what the code imports: run `go mod tidy` after adding or removing an
  import (`unused-dependency`, `unlisted-dependency`).

## Deep modules

- Keep a type's state behind its methods. A method that returns a private slice, map or pointer
  field (`return c.items`) hands callers in other files the state: editing the result
  (`lines[0] = x`, `delete(m, k)`, `sort.Strings(c.Lines())`) fails `mutable-state-escape`. Return a
  copy (`slices.Clone`) or add the operation to the type.
- Pass a function the values it reads. A struct of 5 or more fields handed whole through 2 or more
  functions that read a third of it is reported by `context-threading` (report-only); pass those
  values, or a small struct with just them.
- A lifecycle the project lists in `protocols` (`Begin` with `Commit` or `Rollback`) is closed with
  a `defer` in the function that opens it; a close after the work that is not deferred is skipped
  by an early `return` (`protocol-contract` fails). Three functions repeating the same
  three calls on one type are reported by `caller-protocol` (report-only): give the type one method
  that does them all.
- A function whose whole body is `return other(a, b)` into another file, called through a second
  such function, is a pass-through chain (`forwarding-chain`, report-only): call the last function
  where the first is used, or let a hop own something (a conversion, a default, a dependency).
- A struct whose methods serve two groups of callers that never meet and share no field
  (`disjoint-consumer-groups`, report-only) is two types: split it by who calls what.
- The same three parameters in exported functions of three files
  (`data-clump`, report-only): give them one struct that owns their rules.
- Two packages that group the constants of one enum or field the same way (`Card` and `Paypal` as
  one case in a `switch` here and an `if` there) repeat a rule (`repeated-policy-decision`,
  report-only): give the type one function or method that answers it and call it.
- Functions in other files that branch on the same two fields of a struct that has methods
  (`o.Status` and `o.Tier` in an `if` here and a `switch` there) decide for it
  (`foreign-state-decision`, report-only): move the decision into a method of the struct.

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
- Test every outcome of each branch you write: both sides of an `if` (the body and the condition
  false), every `case` and, without a `default`, a value no case matches, and every loop body
  (`changed-branch-coverage`). A function's CRAP score (complexity and coverage) stays below 9:
  test it, or split a branchy part into its own function.
- Assert on the values your code computes, so a test fails when a line you changed is mutated: a
  boundary (`>` to `>=`), an operator, a removed call or an emptied `case` that no test notices is a
  `mutant-survived` finding, and code no test runs is `mutant-nocoverage`. Test the boundary value
  itself (`Fee(100)` next to `Fee(200)`). Editing a test must not drop an assertion the base tests
  had: a mutant the old tests caught and the new ones miss fails too.
- The tests run under the race detector. A `race/data-race` finding names both accesses to the
  same memory: guard it with a `sync.Mutex`, make it a `sync/atomic` value, or hand it over through
  a channel. Run `go test -race ./...` yourself to reproduce it.
- Every package with code has tests; a module where no test runs fails (`no-tests-ran`). Tests are
  table-driven where cases share a shape: `tests := []struct{...}{...}` and `t.Run(tt.name, ...)`.
- A new or changed unit test runs in under 5 s (`slow-test`); an integration test in under 30 s.
  No `time.Sleep` in a test: wait on a channel or a `sync.WaitGroup`, inject the clock, and fake
  network, database and disk access behind an interface or with `httptest`. A test is integration
  when it lives under an `integration` or `e2e` folder, its file ends in `_integration_test.go`, it
  has an `integration` or `e2e` build tag, or it starts with `if testing.Short() { t.Skip(...) }`
  (only a skip, or a `return`, as the first statement counts; logging under `testing.Short()` does
  not).
- A test prints nothing new at `WARN` or `ERROR` level, and nothing through the standard `log`
  package (`test-console-output`): log in a test with `t.Log`, give the code under test a logger
  the test controls, and fix the cause of a warning the code now logs. A third-party message that
  can't be avoided goes in `testConsole.allow`, which a person accepts.

## When a rule flags legitimate code

Stop and ask. The maintainer adds the entry the finding's message ends with to `exceptions` in
`nitpicker.config.json`, for example
`{ "rule": "vet/printf", "paths": ["shop/label.go"], "reason": "..." }`, or
`{ "rule": "function-lines-limit", "paths": [...], "function": "Name", "reason": "..." }` for a
structure limit. That change is a policy change a person accepts.

The `$schema` line of `nitpicker.config.json`
(`"$schema": "https://raw.githubusercontent.com/jhonDoe15/nitpicker/main/spec/config.schema.json"`)
lets the editor flag a misspelled key or a value the run refuses; nitpicker ignores it. Keep it when
you edit the file.
