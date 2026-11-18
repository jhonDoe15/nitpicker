# Own rules

Part of the [nitpicker-go](../SKILL.md) skill. The gate runs nitpicker's own analyzers as
`go-rules/<rule>` on every package. Write these forms from the start; each finding's message names
the allowed form and ends with its exception entry.

## Errors

- Return an error for an ordinary failure; never `panic` (`go-rules/panic-for-failure`). `panic`
  is for `main`, `init`, a `default` clause that cannot be reached, and a `MustX` function whose
  input the program itself wrote, such as a pattern for `regexp.MustCompile`. Re-panicking a value
  from `recover()` is fine.
- Log an error or return it, never both (`go-rules/logged-and-returned`). Return it wrapped,
  `fmt.Errorf("load order %s: %w", id, err)`, and let the caller that handles it log it once; or
  log it and handle it (fall back, retry, return `nil`). The common logging packages count: `log`,
  `log/slog`, zap, zerolog, logrus, go-kit log, klog, logr, hclog and the others listed in the
  preset's docs.
- Never only log or drop an error and carry on (`go-rules/swallowed-error`): an `if err != nil`
  whose body only logs, `continue`s or returns `false`, `0` or `""` hides the failure from the
  caller. Return it wrapped, handle it with a fallback the caller can tell apart (a named default
  such as `return defaultPort`, a retry), or check the one error you expect with
  `errors.Is(err, fs.ErrNotExist)`.

## Goroutines and contexts

- Every goroutine has an owner that waits for it or stops it (`go-rules/unowned-goroutine`): start
  it with `wg.Go(func() { ... })` and `wg.Wait()`, or an errgroup's `group.Go` and `group.Wait()`,
  or hand it a context the caller cancels or a channel the caller reads.
- Create a root context only in package `main`: `context.Background()` and `context.TODO()`
  anywhere else (`go-rules/context-outside-entry`) start a context no caller can cancel. Take
  `ctx context.Context` as the first parameter and pass it on. Tests use `t.Context()`.
- Never `time.Sleep` to wait for a goroutine you started (`go-rules/sleep-to-wait`): wait on its
  WaitGroup, errgroup, channel or context. A sleep between retries, with no goroutine started
  before it, is fine.
- A `Close`, `Shutdown` or `Stop` that releases several resources runs every release: `errors.Join` the
  results, or `defer` one close per resource, never `if err := a.Close(); err != nil { return err }` before
  the next release (`go-rules/cleanup-skipped`).
- Text read from the query string or a form (`r.URL.Query().Get`, `r.FormValue`) is trimmed before it reaches a
  lookup: wrap the read in `strings.TrimSpace`, best in one helper that reads every query value, since a padded
  `" Davis"` finds nothing (`go-rules/untrimmed-request-text`).
- A `Close` on a type that keeps a map of reply channels closes or sends an error to every channel before it
  clears the map, so no caller blocks forever (`go-rules/pending-not-closed`).
- A `time.NewTicker` is stopped: `defer ticker.Stop()`, or `Stop` on the field in `Close`
  (`go-rules/ticker-not-stopped`).
- An initialiser that can fail does not run inside `sync.Once` or `sync.OnceValues`, which keep the first error:
  guard it with a mutex and reset on failure, or use `singleflight` (`go-rules/once-keeps-error`).
- A map field of a mutex-guarded struct that a method writes per request is `delete`d from when the request ends, or
  bounded (`go-rules/map-only-grows`).

## Package state and design

- Keep state in values, not in package variables (`go-rules/mutable-package-state`): a package
  variable that a function assigns, increments, writes into (`cache[key] = value`) or deletes from
  is shared by every caller. Put it in a struct the caller creates and passes in. A lazy value is
  `var config = sync.OnceValue(load)`, never a `sync.Once` beside a variable. Sentinel errors
  (`var ErrNotFound = errors.New(...)`), tables that are never changed, values set in `init`,
  atomics and `sync.Map` are fine.
- `init` does not print, connect or start anything (`go-rules/init-side-effect`): write a setup
  function that `main` or a constructor calls, and initialize variables in their declaration. A
  driver or format registration (`sql.Register`, `MustRegister`) is fine.
- Return concrete types (`go-rules/lone-interface`): `func NewStore() *Store`, not an interface that
  only `Store` implements. Declare the interface in the package that consumes it, with only the
  methods that package calls. A sealed interface (an unexported method, or one on an unexported
  type, as in functional options) is fine.
- No `any` where a type fits (`go-rules/any-in-exported-signature`): an exported function returns
  its concrete type or a type parameter, and a parameter it type-switches on becomes a type
  parameter with a constraint, or one function per type. `...any` for fmt- and slog-style
  arguments, a value passed straight to encoding or reflection, and a method an imported interface
  requires (`Scan(src any) error`) are fine.
- Name a package for what it provides (`go-rules/generic-package-name` for `helper`, `helpers`,
  `utility`, `commons`, `manager` and `managers`, revive `package-naming` for `util`, `utils`,
  `common`, `misc`, `interfaces` and `types`), and a type or file for the job it does
  (`go-rules/generic-name`): `PriceRounding` and `order_repository.go`, never `OrderManager`,
  `PriceHelper` or `string_utils.go`. `TransactionManager`, `SessionManager` and the other
  managers of a named resource are fine.
- A getter is named after the value (`go-rules/get-prefixed-getter`): `Owner()`, never
  `GetOwner()`, unless an imported interface requires the Get name.
- A value put into an HTML string goes through `html.EscapeString`, or the page uses `html/template`
  (`go-rules/unescaped-html-value`).
- A replacement from data goes to `ReplaceAllLiteralString` (`go-rules/expanding-replacement`):
  `ReplaceAllString` reads `$1` and `${name}` in it, so a `$` in the value is lost.
- A glob or pattern turned into a regexp or a `LIKE` pattern with `strings.ReplaceAll` steps is quoted for the
  target first (`go-rules/pattern-translation`): `strings.ReplaceAll(regexp.QuoteMeta(glob), `\*`, ".*")`,
  never the raw value.
- A parsed or computed float is checked for infinity as well as NaN (`go-rules/nan-only-guard`): `math.IsNaN(x)`
  alone lets `+Inf` and `-Inf` through; add `math.IsInf(x, 0)` or a range check.
- A count computed by subtraction is never negative when it reaches `strings.Repeat`, `bytes.Repeat`, `slices.Grow` or
  `make` (`go-rules/negative-count`): `if pad := width - len(text); pad > 0 { ... }` or `max(0, width-len(text))`.
- A bounds check before an index read rejects with `i >= len(x)` (`go-rules/index-bound-off-by-one`): `i > len(x)`
  lets `i == len(x)` through and `x[i]` panics; `>` is right only for an insertion position.
- A response is checked before its body is decoded (`go-rules/unchecked-response-json`): test
  `resp.StatusCode` first and return an error that names it; a proxy error page is not JSON.
- Never add to a value that can hold the maximum of its type (`go-rules/max-value-overflow`): a
  constant, variable, field or parameter set to `math.MaxInt` (or `MaxInt32`, `MaxInt64`) that a sum or
  product turns negative as an index, slice bound, `make` length, `min`/`max` argument or comparison
  operand. Compare without adding (`width >= len(text)-start`), check the sentinel first
  (`if width == math.MaxInt { ... }`), or clamp with `min` before the add.

## HTTP and databases

- Every outbound HTTP call has a deadline (`go-rules/http-without-timeout`): never `http.Get`,
  `http.Post` or `http.DefaultClient`, and never an `http.Client` without a non-zero `Timeout`.
  Build `&http.Client{Timeout: 10 * time.Second}` once and pass it in. A request that needs a
  shorter deadline adds `http.NewRequestWithContext` with a context from `context.WithTimeout`.
- No database or HTTP call per item of a loop (`go-rules/io-in-loop`): read or write the items in one
  batch (`WHERE id = ANY($1)`, `IN (...)`, `COPY`, `pgx.Batch`, a bulk endpoint), or run the calls
  concurrently under an errgroup with `SetLimit`. Inside one transaction, prepare the statement
  once and execute it per item. A loop over a fixed list (migrations), a retry loop over a count, a
  loop over a channel and a loop that stops at the first success are fine.
- A gqlgen field resolver of a list parent does not query per parent
  (`go-rules/query-per-parent-resolver`): a method such as `func (r *viewResolver) Owner(ctx, obj *View)`
  that queries by `obj.OwnerID` costs one query per list item. Load through a batched dataloader, or read
  what the parent already carries. A parent that is only returned alone is fine.
- Related writes go through one transaction (`go-rules/writes-without-transaction`,
  `go-rules/write-outside-transaction`): two writes on different tables in one function belong in
  `db.BeginTx` (gorm `db.Transaction`) with every write on the `tx`, or in the caller's transaction
  passed in. A write through the outer `db` while a `tx` is open runs outside the transaction. A
  write that must survive a rollback (an audit row) is the exception.
- One failing item does not stop a scheduled or queue job (`go-rules/failing-item-stops-job`): in a
  robfig/cron, gocron, asynq or machinery job, a loop over tenants or accounts that calls the database
  or a remote service records the error per item and continues (`errors.Join`, a failed-items slice),
  or enqueues one task per item. A job that must be retried as a whole is the exception.

## Literals, comments and methods

- Name a string you write more than twice in a file (`go-rules/repeated-string-literal`): a
  constant, or a typed constant when it is one of a set of values (`type Status string`). Struct
  tags, map keys, `case` values, log attribute keys and format templates are not counted.
- Every task marker names its issue (`go-rules/todo-without-issue`): `// TODO(#123): ...`, or the
  tracker's key, `// TODO(PROJ-123): ...`. A `TODO(name)` or a bare `TODO:` is never picked up;
  file the issue or do the work now.
- One method per operation (`go-rules/forwarding-method-alias`): a method that only passes its
  parameters on to another method of the same type is an alias. Call the target directly, or
  rename it, and delete the other. A method an interface asks for (`Write` for `io.Writer`) may
  forward.

## Secrets

- No secret in the source (`go-rules/hardcoded-secret`, `go-rules/credential-shape`): read
  passwords, tokens and keys from the environment or a secret store in `main` and pass them in,
  `cmp.Or(os.Getenv("API_TOKEN"), "...")` included. A placeholder (`changeme`, `${TOKEN}`) is fine.
- Never log a secret or put it in an error (`go-rules/secret-in-log`): log only that it is set,
  `slog.Bool("token_set", token != "")`, or its length.

## Tests

- Every test asserts (`go-rules/test-without-assertion`): check the result with
  `if got != want { t.Errorf(...) }`, testify `assert`/`require`, or a helper you hand `t`. A
  test that only calls the code passes whatever it does.
- Assert outright, not under a condition (`go-rules/conditional-assertion-in-test`): check the
  condition itself first, `if resp == nil { t.Fatal("no response") }`, then the value; never
  `if resp != nil { if resp.Code != 200 { ... } }`. Give a `switch` on a result a `default` that
  fails.
- No assertions in a loop over a computed collection, which can be empty: loop over a literal table
  and run each case as a `t.Run` subtest, or compare the whole collection at once (`slices.Equal`,
  `cmp.Diff`). A loop with a constant count (`for range 3`) is fine.
- Skip only on a real condition, with a reason (`go-rules/switched-off-test`,
  `go-rules/skipped-test-without-reason`): `if testing.Short() { t.Skip("needs the database") }`.
  A test that always skips is deleted or fixed.
- Use a production constant by name, never a copy of its value (`go-rules/copied-constant-in-test`):
  `Clamp(Limit + 1)`, not `Clamp(51)`. A test that holds the copy keeps checking the old value when
  the constant changes. Pin a contract value next to the constant on purpose:
  `if Limit != 50 { t.Fatalf(...) }` or `assert.Equal(t, 50, Limit)`.
- Never sleep in a test (`go-rules/sleep-in-test`): wait for the event (a channel,
  `sync.WaitGroup`), or run the code in a `testing/synctest` bubble, where time is virtual. A fake
  that sleeps to act slow is fine.
- A goroutine a test starts is waited for before the test returns (`go-rules/unowned-goroutine`).
- HTTP text is case-insensitive (`go-rules/http-value-case`): compare a header value, a `Host`, a cookie
  name prefix or a file extension with `strings.EqualFold`, or lowercase it first, and parse
  structured headers (`go-rules/hand-split-http-header`) with `mime.ParseMediaType` or
  `http.ParseCookie` instead of `strings.Split(value, ",")`. `Header.Get` canonicalises the name; index
  `Header` only with a canonical key (`http.CanonicalHeaderKey`). A library that is itself the parser
  takes an exception. `url.Parse` already lowercases the scheme, so `u.Scheme == "https"` is fine.
