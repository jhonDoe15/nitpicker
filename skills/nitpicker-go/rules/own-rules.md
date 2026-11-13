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
- Never sleep in a test (`go-rules/sleep-in-test`): wait for the event (a channel,
  `sync.WaitGroup`), or run the code in a `testing/synctest` bubble, where time is virtual. A fake
  that sleeps to act slow is fine.
- A goroutine a test starts is waited for before the test returns (`go-rules/unowned-goroutine`).
